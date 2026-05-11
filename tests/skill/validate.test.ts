import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../../src/core/errors.ts";
import { hasSkillMd, loadSkill } from "../../src/skill/load.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

describe("loadSkill", () => {
  test("C-SPEC-01 missing SKILL.md fails", () => {
    const d = makeTempDir();
    expect(() => loadSkill(d)).toThrow(CrewError);
  });

  test("C-SPEC-02 unparseable YAML fails", () => {
    const d = makeTempDir();
    const skill = join(d, "foo");
    require("node:fs").mkdirSync(skill);
    writeFileSync(join(skill, "SKILL.md"), "---\n:: bad\n---\nbody");
    expect(() => loadSkill(skill)).toThrow(CrewError);
  });

  test("C-SPEC-03 missing name fails", () => {
    const d = makeTempDir();
    const skill = makeSkill(d, "foo", "description: x");
    expect(() => loadSkill(skill)).toThrow(/name/);
  });

  test("C-SPEC-04 missing description fails", () => {
    const d = makeTempDir();
    const skill = makeSkill(d, "foo", "name: foo");
    expect(() => loadSkill(skill)).toThrow(/description/);
  });

  test("C-SPEC-04 empty description fails", () => {
    const d = makeTempDir();
    const skill = makeSkill(d, "foo", "name: foo\ndescription: ''");
    expect(() => loadSkill(skill)).toThrow(/description/);
  });

  test("C-SPEC-05 uppercase name fails", () => {
    const d = makeTempDir();
    const skill = makeSkill(d, "Foo", skillFrontmatter({ name: "Foo" }));
    expect(() => loadSkill(skill)).toThrow(/name/);
  });

  test("C-SPEC-06 leading hyphen fails", () => {
    const d = makeTempDir();
    // The invalid frontmatter name triggers validation; the directory name is just a source location.
    const skill = makeSkill(d, "-bad", skillFrontmatter({ name: "-bad" }));
    expect(() => loadSkill(skill)).toThrow(/name/);
  });

  test("C-SPEC-06 trailing hyphen fails", () => {
    const d = makeTempDir();
    const skill = makeSkill(d, "bad-", skillFrontmatter({ name: "bad-" }));
    expect(() => loadSkill(skill)).toThrow(/name/);
  });

  test("C-SPEC-07 consecutive hyphens fail", () => {
    const d = makeTempDir();
    const skill = makeSkill(d, "a--b", skillFrontmatter({ name: "a--b" }));
    expect(() => loadSkill(skill)).toThrow(/name/);
  });

  test("C-SPEC-08 name longer than 64 chars fails", () => {
    const longName = `a${"b".repeat(64)}`;
    const d = makeTempDir();
    const skill = makeSkill(d, longName, skillFrontmatter({ name: longName }));
    expect(() => loadSkill(skill)).toThrow(/name/);
  });

  test("C-SPEC-09 description longer than 1024 chars fails", () => {
    const d = makeTempDir();
    const big = "x".repeat(1025);
    const skill = makeSkill(d, "foo", skillFrontmatter({ name: "foo", description: big }));
    expect(() => loadSkill(skill)).toThrow(/description/);
  });

  test("declared name may differ from source directory name", () => {
    const d = makeTempDir();
    const skill = makeSkill(d, "wrongname", skillFrontmatter({ name: "foo" }));
    expect(loadSkill(skill).frontmatter.name).toBe("foo");
  });

  test("C-SPEC-14 name may start with a digit", () => {
    const d = makeTempDir();
    const skill = makeSkill(
      d,
      "3-statement-model",
      skillFrontmatter({ name: "3-statement-model" }),
    );
    expect(loadSkill(skill).frontmatter.name).toBe("3-statement-model");
  });

  test("C-SPEC-11 compatibility > 500 chars fails", () => {
    const d = makeTempDir();
    const big = "x".repeat(501);
    const skill = makeSkill(d, "foo", skillFrontmatter({ name: "foo", compatibility: big }));
    expect(() => loadSkill(skill)).toThrow(/compatibility/);
  });

  test("compatibility within limits is accepted", () => {
    const d = makeTempDir();
    const skill = makeSkill(
      d,
      "foo",
      skillFrontmatter({ name: "foo", compatibility: "Claude Code" }),
    );
    const loaded = loadSkill(skill);
    expect(loaded.frontmatter.compatibility).toBe("Claude Code");
  });

  test("license optional, must be string", () => {
    const d = makeTempDir();
    const skill = makeSkill(d, "foo", "name: foo\ndescription: x\nlicense: 42");
    expect(() => loadSkill(skill)).toThrow(/license/);
  });

  test("valid skill loads", () => {
    const d = makeTempDir();
    const skill = makeSkill(
      d,
      "foo",
      skillFrontmatter({
        name: "foo",
        license: "MIT",
        homepage: "https://example.com",
        dependencies: ["bar"],
      }),
    );
    const loaded = loadSkill(skill);
    expect(loaded.frontmatter.name).toBe("foo");
    expect(loaded.frontmatter.license).toBe("MIT");
    expect(loaded.frontmatter.metadata?.crew?.homepage).toBe("https://example.com");
    expect(loaded.frontmatter.metadata?.crew?.dependencies).toEqual(["bar"]);
  });

  test("metadata.crew.dependencies must be list of strings", () => {
    const d = makeTempDir();
    const bad = "name: foo\ndescription: x\nmetadata:\n  crew:\n    dependencies: not-a-list";
    const skill = makeSkill(d, "foo", bad);
    expect(() => loadSkill(skill)).toThrow(/dependencies/);
  });

  test("metadata.crew.dependencies with empty string fails", () => {
    const d = makeTempDir();
    const bad = "name: foo\ndescription: x\nmetadata:\n  crew:\n    dependencies:\n      - ''";
    const skill = makeSkill(d, "foo", bad);
    expect(() => loadSkill(skill)).toThrow(/dependencies/);
  });

  test("metadata must be mapping", () => {
    const d = makeTempDir();
    const bad = "name: foo\ndescription: x\nmetadata: scalar";
    const skill = makeSkill(d, "foo", bad);
    expect(() => loadSkill(skill)).toThrow(/metadata/);
  });

  test("metadata.crew must be mapping", () => {
    const d = makeTempDir();
    const bad = "name: foo\ndescription: x\nmetadata:\n  crew: scalar";
    const skill = makeSkill(d, "foo", bad);
    expect(() => loadSkill(skill)).toThrow(/crew/);
  });

  test("metadata.crew.homepage must be string", () => {
    const d = makeTempDir();
    const bad = "name: foo\ndescription: x\nmetadata:\n  crew:\n    homepage: 42";
    const skill = makeSkill(d, "foo", bad);
    expect(() => loadSkill(skill)).toThrow(/homepage/);
  });

  test("hasSkillMd", () => {
    const d = makeTempDir();
    expect(hasSkillMd(d)).toBe(false);
    const skill = makeSkill(d, "foo", skillFrontmatter({ name: "foo" }));
    expect(hasSkillMd(skill)).toBe(true);
  });
});
