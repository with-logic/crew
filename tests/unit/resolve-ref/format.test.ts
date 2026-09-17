/**
 * formatCandidate / shortLabelFor (§8.5): how ambiguous-reference candidates are
 * rendered for the user.
 */

import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { TapConfig } from "../../../src/core/types.ts";
import type { NameCandidate } from "../../../src/install/attribute-bare-name.ts";
import { formatCandidate, shortLabelFor } from "../../../src/install/resolve-ref/format.ts";
import { resolveTapRef } from "../../../src/install/resolve-ref/index.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

import { configWith, pathTap, tapRef } from "./helpers.ts";

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
