/**
 * resolveTapRef for qualified references (§8.3, §8.5): 3-segment `tap/ns/skill`
 * and 2-segment `tap/skill` / `ns/skill` lookups.
 */

import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../../../src/core/errors.ts";
import { resolveTapRef } from "../../../src/install/resolve-ref/index.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

import { configWith, pathTap, tapRef } from "./helpers.ts";

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
      /does not match/,
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
});
