/**
 * resolveTapRef for bare names (§8.3, §8.5): unique hits, ambiguity, and the
 * `kindHint` filter.
 */

import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { resolveTapRef } from "../../../src/install/resolve-ref/index.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

import { configWith, pathTap, tapRef } from "./helpers.ts";

describe("resolveTapRef", () => {
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
      /was not found in any configured tap/,
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
