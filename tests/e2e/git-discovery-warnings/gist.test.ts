/** Literal gist file discovery ignores symlinks without directory warnings (§9, §16.6). */

import { afterEach, expect, test } from "bun:test";
import { symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resetGitRunner } from "../../../src/git/exec.ts";
import { commitAll, makeSkill, skillFrontmatter } from "../../helpers/fixtures.ts";
import { GIST_URL, gistFixture } from "../gist/helpers.ts";
import { WARNING } from "./fixtures.ts";

afterEach(resetGitRunner);

test("C-TAP-08g gist ignored symlinks, directories and invalid files remain silent", () => {
  const f = gistFixture({ "SKILL.md": "root-file", "anything.txt": "healthy" });
  symlinkSync("absent-gist-target", join(f.repo, "ignored-link"));
  makeSkill(f.repo, "ignored-directory", skillFrontmatter({ name: "decoy" }));
  writeFileSync(join(f.repo, "invalid.md"), "---\nname: invalid\n---\n");
  commitAll(f.repo, "ignored gist entries");
  expect(f.cli("tap", "add", GIST_URL, "snippets").code).toBe(0);
  const search = f.cli("search", "--tap", "snippets", "--json");
  expect(search.code).toBe(0);
  expect(search.err).toBe("");
  expect(JSON.parse(search.out).warnings).toEqual([]);
  expect(JSON.parse(search.out).hits.map((hit: { name: string }) => hit.name)).toEqual([
    "healthy",
    "root-file",
  ]);
  for (const ref of ["snippets", "snippets/healthy", GIST_URL]) {
    const result = f.cli("info", ref, "--json");
    expect(result.code).toBe(0);
    expect(result.err).toBe("");
    expect(JSON.parse(result.out)).not.toHaveProperty("warnings");
    expect(result.out).not.toContain(WARNING);
    expect(result.out).not.toContain("absent-gist-target");
  }
});
