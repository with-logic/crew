/**
 * Unit tests for `resolve-ref/` — converting a parsed TapSource into
 * a concrete NameCandidate, plus the formatting helpers.
 */

import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../../src/core/errors.ts";
import type { Config, TapConfig, TapSource } from "../../src/core/types.ts";
import type { NameCandidate } from "../../src/install/attribute-bare-name.ts";
import { formatCandidate, shortLabelFor } from "../../src/install/resolve-ref/format.ts";
import { resolveTapRef } from "../../src/install/resolve-ref/index.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

function pathTap(path: string, name: string): TapConfig {
  return { name, kind: "path", registered: true, url: "", subpath: "", path };
}

function configWith(...taps: TapConfig[]): Config {
  return {
    taps,
    forced_agents: [],
    disabled_agents: [],
    autoupdate: { enabled: false, interval_seconds: 14400 },
  };
}

function tapRef(
  tap: string | null,
  namespace: string | null,
  name: string,
  ref: string | null = null,
): TapSource {
  return { type: "tap", tap, namespace, name, ref };
}

describe("resolveTapRef", () => {
  test("3-segment: direct lookup succeeds", () => {
    const root = makeTempDir("rr-3-");
    const skillsDir = join(root, "skills");
    mkdirSync(skillsDir);
    const ns = join(skillsDir, "marketing");
    mkdirSync(ns);
    makeSkill(ns, "email", skillFrontmatter({ name: "email" }));

    const cfg = configWith(pathTap(root, "acme"));
    const result = resolveTapRef(tapRef("acme", "marketing", "email"), cfg, "/unused");
    expect(result.kind).toBe("skill");
    if (result.kind === "skill") {
      expect(result.location.namespace).toBe("marketing");
      expect(result.location.name).toBe("email");
    }
  });

  test("3-segment: missing tap → invalid_ref", () => {
    const cfg = configWith();
    expect(() => resolveTapRef(tapRef("acme", "marketing", "email"), cfg, "/unused")).toThrow(
      CrewError,
    );
  });

  test("3-segment: tap exists but skill missing → invalid_ref", () => {
    const root = makeTempDir("rr-3-miss-");
    const cfg = configWith(pathTap(root, "acme"));
    expect(() => resolveTapRef(tapRef("acme", "marketing", "nope"), cfg, "/unused")).toThrow(
      /doesn't exist/,
    );
  });

  test("2-segment: tap/skill resolves as tap-skill when tap matches", () => {
    const root = makeTempDir("rr-2-tap-");
    makeSkill(root, "pdf", skillFrontmatter({ name: "pdf" }));
    const cfg = configWith(pathTap(root, "anthropic"));
    const result = resolveTapRef(tapRef("anthropic", null, "pdf"), cfg, "/unused");
    expect(result.kind).toBe("skill");
  });

  test("2-segment: ns/skill when first segment isn't a tap", () => {
    const root = makeTempDir("rr-2-ns-");
    const skillsDir = join(root, "skills");
    mkdirSync(skillsDir);
    const ns = join(skillsDir, "marketing");
    mkdirSync(ns);
    makeSkill(ns, "email", skillFrontmatter({ name: "email" }));
    const cfg = configWith(pathTap(root, "core"));
    // User typed `marketing/email`. `marketing` isn't a tap → check
    // namespaces across taps → exactly one match → resolve.
    const result = resolveTapRef(tapRef("marketing", null, "email"), cfg, "/unused");
    expect(result.kind).toBe("skill");
    if (result.kind === "skill") expect(result.location.namespace).toBe("marketing");
  });

  test("2-segment: ns/skill in multiple taps → ambiguous_reference", () => {
    const a = makeTempDir("rr-2-ambig-a-");
    const b = makeTempDir("rr-2-ambig-b-");
    for (const root of [a, b]) {
      const skillsDir = join(root, "skills");
      mkdirSync(skillsDir);
      const ns = join(skillsDir, "marketing");
      mkdirSync(ns);
      makeSkill(ns, "email", skillFrontmatter({ name: "email" }));
    }
    const cfg = configWith(pathTap(a, "acme"), pathTap(b, "globex"));
    expect(() => resolveTapRef(tapRef("marketing", null, "email"), cfg, "/unused")).toThrow(
      /multiple/,
    );
  });

  test("2-segment: no match → invalid_ref", () => {
    const root = makeTempDir("rr-2-nope-");
    const cfg = configWith(pathTap(root, "core"));
    expect(() => resolveTapRef(tapRef("nope", null, "nada"), cfg, "/unused")).toThrow(
      /doesn't resolve/,
    );
  });

  test("2-segment: tap-hit + namespace-hit both present → tap wins (back-compat)", () => {
    // acme tap has skill `foo` at root, AND another tap has a
    // namespace `acme` with skill `foo` in it. Tap-first wins.
    const a = makeTempDir("rr-2-both-a-");
    makeSkill(a, "foo", skillFrontmatter({ name: "foo" }));
    const b = makeTempDir("rr-2-both-b-");
    const bSkills = join(b, "skills");
    mkdirSync(bSkills);
    const ns = join(bSkills, "acme");
    mkdirSync(ns);
    makeSkill(ns, "foo", skillFrontmatter({ name: "foo" }));

    const cfg = configWith(pathTap(a, "acme"), pathTap(b, "other"));
    const result = resolveTapRef(tapRef("acme", null, "foo"), cfg, "/unused");
    expect(result.kind).toBe("skill");
    if (result.kind === "skill") {
      expect(result.tap.name).toBe("acme");
      expect(result.location.namespace).toBe(null);
    }
  });

  test("bare: unique skill hit", () => {
    const root = makeTempDir("rr-b-skill-");
    makeSkill(root, "pdf", skillFrontmatter({ name: "pdf" }));
    const cfg = configWith(pathTap(root, "core"));
    const result = resolveTapRef(tapRef(null, null, "pdf"), cfg, "/unused");
    expect(result.kind).toBe("skill");
  });

  test("bare: no match → invalid_ref", () => {
    const root = makeTempDir("rr-b-nope-");
    const cfg = configWith(pathTap(root, "core"));
    expect(() => resolveTapRef(tapRef(null, null, "ghost"), cfg, "/unused")).toThrow(
      /isn't a tap, skill, or namespace/,
    );
  });

  test("bare: ambiguous across skill + namespace → ambiguous_reference", () => {
    // Skill `pdf` in tap A, namespace `pdf` in tap B.
    const a = makeTempDir("rr-b-ambig-a-");
    makeSkill(a, "pdf", skillFrontmatter({ name: "pdf" }));
    const b = makeTempDir("rr-b-ambig-b-");
    const bSkills = join(b, "skills");
    mkdirSync(bSkills);
    const pdfNs = join(bSkills, "pdf");
    mkdirSync(pdfNs);
    makeSkill(pdfNs, "extract", skillFrontmatter({ name: "extract" }));

    const cfg = configWith(pathTap(a, "flat"), pathTap(b, "docs"));
    expect(() => resolveTapRef(tapRef(null, null, "pdf"), cfg, "/unused")).toThrow(/ambiguous/);
  });

  test("bare + kindHint=skill filters to skill candidates", () => {
    const a = makeTempDir("rr-b-hint-a-");
    makeSkill(a, "pdf", skillFrontmatter({ name: "pdf" }));
    const b = makeTempDir("rr-b-hint-b-");
    const bSkills = join(b, "skills");
    mkdirSync(bSkills);
    const pdfNs = join(bSkills, "pdf");
    mkdirSync(pdfNs);
    makeSkill(pdfNs, "extract", skillFrontmatter({ name: "extract" }));

    const cfg = configWith(pathTap(a, "flat"), pathTap(b, "docs"));
    const result = resolveTapRef(tapRef(null, null, "pdf"), cfg, "/unused", "skill");
    expect(result.kind).toBe("skill");
  });

  test("bare + kindHint mismatch → invalid_ref", () => {
    const root = makeTempDir("rr-b-hint-miss-");
    makeSkill(root, "pdf", skillFrontmatter({ name: "pdf" }));
    const cfg = configWith(pathTap(root, "core"));
    // The name only exists as a skill; forcing `namespace` fails.
    expect(() => resolveTapRef(tapRef(null, null, "pdf"), cfg, "/unused", "namespace")).toThrow(
      /not a namespace/,
    );
  });

  test("bare + kindHint=skill but name is a namespace → invalid_ref", () => {
    const root = makeTempDir("rr-b-skill-hint-miss-");
    const skillsDir = join(root, "skills");
    mkdirSync(skillsDir);
    const ns = join(skillsDir, "marketing");
    mkdirSync(ns);
    makeSkill(ns, "email", skillFrontmatter({ name: "email" }));
    const cfg = configWith(pathTap(root, "core"));
    // `marketing` is a namespace only; forcing `skill` fails with
    // a message naming --skill as the flag to drop.
    expect(() => resolveTapRef(tapRef(null, null, "marketing"), cfg, "/unused", "skill")).toThrow(
      /--skill/,
    );
  });

  test("bare + kindHint=tap but name is a skill → invalid_ref", () => {
    const root = makeTempDir("rr-b-tap-hint-miss-");
    makeSkill(root, "pdf", skillFrontmatter({ name: "pdf" }));
    const cfg = configWith(pathTap(root, "core"));
    expect(() => resolveTapRef(tapRef(null, null, "pdf"), cfg, "/unused", "tap")).toThrow(
      /not a tap/,
    );
  });

  test("bare + kindHint with multiple matching candidates → ambiguous", () => {
    const a = makeTempDir("rr-b-hint-multi-a-");
    makeSkill(a, "pdf", skillFrontmatter({ name: "pdf" }));
    const b = makeTempDir("rr-b-hint-multi-b-");
    makeSkill(b, "pdf", skillFrontmatter({ name: "pdf" }));
    const cfg = configWith(pathTap(a, "one"), pathTap(b, "two"));
    expect(() => resolveTapRef(tapRef(null, null, "pdf"), cfg, "/unused", "skill")).toThrow(
      /ambiguous/,
    );
  });
});

describe("formatCandidate / shortLabelFor", () => {
  const tap: TapConfig = {
    name: "acme",
    kind: "path",
    registered: true,
    url: "",
    subpath: "",
    path: "/unused",
  };

  test("tap candidate", () => {
    const c: NameCandidate = { kind: "tap", tap };
    expect(formatCandidate(c, "acme")).toContain("--tap acme");
    expect(shortLabelFor(c, "acme")).toContain("install the `acme` tap");
  });

  test("namespace candidate", () => {
    const c: NameCandidate = {
      kind: "namespace",
      tap,
      namespace: "marketing",
      members: [
        {
          name: "email",
          namespace: "marketing",
          path: "/x",
          tapRelativePath: "skills/marketing/email",
        },
      ],
    };
    expect(formatCandidate(c, "marketing")).toContain("crew install acme/marketing");
    expect(shortLabelFor(c, "marketing")).toContain("`marketing` namespace");
  });

  test("skill candidate (unnamespaced)", () => {
    const c: NameCandidate = {
      kind: "skill",
      tap,
      location: { name: "pdf", namespace: null, path: "/x", tapRelativePath: "skills/pdf" },
    };
    expect(formatCandidate(c, "pdf")).toContain("crew install acme/pdf");
    expect(shortLabelFor(c, "pdf")).toContain("from `acme`");
  });

  test("skill candidate (namespaced)", () => {
    const c: NameCandidate = {
      kind: "skill",
      tap,
      location: { name: "pdf", namespace: "docs", path: "/x", tapRelativePath: "skills/docs/pdf" },
    };
    expect(formatCandidate(c, "pdf")).toContain("crew install acme/docs/pdf");
    expect(shortLabelFor(c, "pdf")).toContain("`docs`");
  });

  test("tap with same-named internal namespace: resolver reports ambiguity", () => {
    // Tap `pdf` contains `skills/pdf/extract` — the name `pdf` shows
    // up as both a tap AND a namespace within that same tap. From the
    // resolver's perspective this is ambiguous; the CLI filter drops
    // the same-named-in-tap candidate so the install command can
    // short-circuit to tap-install (see ambiguity-prompt tests).
    const root = makeTempDir("rr-tap-ns-same-");
    const skillsDir = join(root, "skills");
    mkdirSync(skillsDir);
    const ns = join(skillsDir, "pdf");
    mkdirSync(ns);
    makeSkill(ns, "extract", skillFrontmatter({ name: "extract" }));
    const cfg = configWith(pathTap(root, "pdf"));
    expect(() => resolveTapRef(tapRef(null, null, "pdf"), cfg, "/unused")).toThrow(/ambiguous/);
  });

  test("singular vs plural skill count in namespace", () => {
    const one: NameCandidate = {
      kind: "namespace",
      tap,
      namespace: "solo",
      members: [{ name: "one", namespace: "solo", path: "/x", tapRelativePath: "skills/solo/one" }],
    };
    expect(formatCandidate(one, "solo")).toContain("1 skill in");
    expect(shortLabelFor(one, "solo")).toContain("(1 skill)");
  });
});
