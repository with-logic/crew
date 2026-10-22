/** Search reports rejected directory manifests and keeps healthy hits (§9, §16.6). */

import { expect, test } from "bun:test";
import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { makeSkill, skillFrontmatter } from "../../helpers/fixtures.ts";
import { searchFixture } from "./helpers.ts";

for (const query of ["", "healthy", "unrelated"]) {
  test(`C-TAP-08d search warns about invalid manifests for query '${query}'`, () => {
    const f = searchFixture();
    const bad = makeSkill(f.root, "bad", skillFrontmatter({ name: "BAD_NAME" }));
    const malformed = makeSkill(f.root, "malformed", "name: [broken");
    const incomplete = makeSkill(f.root, "incomplete", "name: incomplete");
    const linked = join(f.root, "linked");
    mkdirSync(linked);
    symlinkSync(join(bad, "SKILL.md"), join(linked, "SKILL.md"));
    makeSkill(f.root, "healthy", skillFrontmatter({ name: "healthy" }));

    const json = f.search(["--json", "--tap", "local", query]);
    expect(json.code).toBe(0);
    expect(json.err).toBe("");
    const parsed = JSON.parse(json.out);
    expect(parsed.hits.map((h: { name: string }) => h.name)).toEqual(
      query === "unrelated" ? [] : ["healthy"],
    );
    expect(parsed.warnings).toHaveLength(4);
    for (const path of [bad, malformed, incomplete, linked]) {
      expect(parsed.warnings).toContainEqual(expect.stringContaining(path));
    }
    for (const warning of parsed.warnings) {
      expect(warning).toContain("local");
      expect(warning).toContain("invalid_skill");
    }
    expect(parsed.warnings.join("\n")).toContain("`name` has invalid characters");
    expect(parsed.warnings.join("\n")).not.toContain("BAD_NAME");
    expect(parsed.warnings.join("\n")).toContain("isn't valid YAML");
    expect(parsed.warnings.join("\n")).toContain("description");
    expect(parsed.warnings.join("\n")).toContain("must not be a symbolic link");

    const human = f.search(["--tap", "local", query]);
    expect(human.code).toBe(0);
    for (const warning of parsed.warnings) expect(human.err).toContain(warning);
    if (query !== "unrelated") expect(human.out).toContain("healthy");
  });
}

test("C-TAP-08d search sanitizes and redacts the entire warning, preserving raw hit metadata", () => {
  const tapName = "local\nforged";
  const f = searchFixture(tapName);
  makeSkill(f.root, "bad\nforged", "name: https://private-token@example.com/skill");
  makeSkill(f.root, "full\nforged", "name: incomplete\ndescription: ''");
  const description = "raw https://private-token@example.com/skill metadata";
  makeSkill(f.root, "healthy", skillFrontmatter({ name: "healthy", description }));

  const result = f.search(["--json"]);
  expect(result.code).toBe(0);
  const parsed = JSON.parse(result.out);
  expect(parsed.warnings).toHaveLength(2);
  for (const warning of parsed.warnings) {
    expect(warning).not.toContain("\n");
    expect(warning).toContain("\\x0a");
    expect(warning).not.toContain("private-token");
  }
  expect(parsed.hits[0].tap).toBe(tapName);
  expect(parsed.hits[0].description).toBe(description);
});
