/**
 * Unit tests for `expandSkills` (§9 step 5).
 *
 * The e2e tests in tests/e2e/install.test.ts cover the happy paths by
 * running the full install flow. These tests exercise `expandSkills`
 * directly to hit each branch of the three-case decision tree —
 * especially the `skills/`-subdir branch and its zero-children error
 * path.
 */

import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expandSkills } from "../../src/sources/expand.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

describe("expandSkills", () => {
  test("root SKILL.md wins even when skills/ subdir exists", () => {
    // A skill's name must match its parent dir, so stage under a
    // normalized subdirectory rather than the tmp root.
    const tmp = makeTempDir("expand-root-");
    const root = makeSkill(tmp, "demo", skillFrontmatter({ name: "demo" }));
    mkdirSync(join(root, "skills"));
    makeSkill(join(root, "skills"), "nested", skillFrontmatter({ name: "nested" }));

    const result = expandSkills(root);
    expect(result.valid.length).toBe(1);
    // The root is a single skill; `skills/` is ignored entirely.
    expect(result.valid[0]!.path).toBe(root);
  });

  test("skills/ directory is walked when no root SKILL.md", () => {
    const root = makeTempDir("expand-skills-");
    const skillsDir = join(root, "skills");
    mkdirSync(skillsDir);
    makeSkill(skillsDir, "alpha", skillFrontmatter({ name: "alpha" }));
    makeSkill(skillsDir, "beta", skillFrontmatter({ name: "beta" }));
    // A stray root-level skill — must be ignored when `skills/` is present.
    makeSkill(root, "ignored", skillFrontmatter({ name: "ignored" }));

    const names = expandSkills(root)
      .valid.map((s) => s.frontmatter.name)
      .sort();
    expect(names).toEqual(["alpha", "beta"]);
  });

  test("skills/ with zero valid children aborts with no_skills_found", () => {
    const root = makeTempDir("expand-skills-empty-");
    mkdirSync(join(root, "skills"));
    // Child directory without a SKILL.md — does not count.
    mkdirSync(join(root, "skills", "not-a-skill"));

    expect(() => expandSkills(root)).toThrow(/no valid skills found/);
  });

  test("falls back to walking root when no root SKILL.md and no skills/", () => {
    const root = makeTempDir("expand-fallback-");
    makeSkill(root, "one", skillFrontmatter({ name: "one" }));
    makeSkill(root, "two", skillFrontmatter({ name: "two" }));

    const names = expandSkills(root)
      .valid.map((s) => s.frontmatter.name)
      .sort();
    expect(names).toEqual(["one", "two"]);
  });

  test("expanded skill names come from SKILL.md, not directory names", () => {
    const root = makeTempDir("expand-declared-name-");
    makeSkill(root, "source-folder", skillFrontmatter({ name: "declared-name" }));

    const skills = expandSkills(root).valid;
    expect(skills[0]!.frontmatter.name).toBe("declared-name");
    expect(skills[0]!.path).toBe(join(root, "source-folder"));
  });

  test("skipping non-directory children in the walk", () => {
    // Exercises the `!isDirectory(candidate)` branch of the collector.
    const root = makeTempDir("expand-skip-");
    makeSkill(root, "real", skillFrontmatter({ name: "real" }));
    writeFileSync(join(root, "README.md"), "not a directory");

    const names = expandSkills(root).valid.map((s) => s.frontmatter.name);
    expect(names).toEqual(["real"]);
  });

  test("skipping directories without a SKILL.md", () => {
    // Exercises the `!hasSkillMd(candidate)` branch.
    const root = makeTempDir("expand-no-skillmd-");
    makeSkill(root, "real", skillFrontmatter({ name: "real" }));
    mkdirSync(join(root, "docs"));
    writeFileSync(join(root, "docs", "index.md"), "# docs");

    const names = expandSkills(root).valid.map((s) => s.frontmatter.name);
    expect(names).toEqual(["real"]);
  });

  test("namespace: descends one level under skills/ into grouping dirs", () => {
    const root = makeTempDir("expand-ns-");
    const skillsDir = join(root, "skills");
    mkdirSync(skillsDir);
    // A namespace: dir under skills/ with no SKILL.md but with children.
    const marketing = join(skillsDir, "marketing");
    mkdirSync(marketing);
    makeSkill(marketing, "email-outreach", skillFrontmatter({ name: "email-outreach" }));
    makeSkill(marketing, "social-posts", skillFrontmatter({ name: "social-posts" }));
    // A regular (non-namespaced) skill at the skills/ root.
    makeSkill(skillsDir, "standalone", skillFrontmatter({ name: "standalone" }));

    const skills = expandSkills(root).valid;
    const names = skills.map((s) => s.frontmatter.name).sort();
    expect(names).toEqual(["email-outreach", "social-posts", "standalone"]);
    // Namespaced skills carry the namespace in their path.
    const marketingSkills = skills.filter((s) => s.path.includes("/marketing/"));
    expect(marketingSkills.length).toBe(2);
  });

  test("namespace: empty namespace dir is silently ignored", () => {
    // A dir under skills/ with no SKILL.md and no skill children is not
    // a namespace and not a skill — just drop it. Silent because users
    // may have non-skill content (docs/, scripts/) under skills/.
    const root = makeTempDir("expand-empty-ns-");
    const skillsDir = join(root, "skills");
    mkdirSync(skillsDir);
    mkdirSync(join(skillsDir, "docs"));
    writeFileSync(join(skillsDir, "docs", "README.md"), "# docs");
    makeSkill(skillsDir, "real", skillFrontmatter({ name: "real" }));

    const names = expandSkills(root).valid.map((s) => s.frontmatter.name);
    expect(names).toEqual(["real"]);
  });

  test("namespace: deeper-than-one nesting under a namespace is ignored", () => {
    const root = makeTempDir("expand-deep-ns-");
    const skillsDir = join(root, "skills");
    mkdirSync(skillsDir);
    const marketing = join(skillsDir, "marketing");
    mkdirSync(marketing);
    makeSkill(marketing, "real", skillFrontmatter({ name: "real" }));
    // Deeper nesting — should not be walked.
    const tooDeep = join(marketing, "nested");
    mkdirSync(tooDeep);
    makeSkill(tooDeep, "too-deep", skillFrontmatter({ name: "too-deep" }));

    const names = expandSkills(root)
      .valid.map((s) => s.frontmatter.name)
      .sort();
    expect(names).toEqual(["real"]);
  });
});
