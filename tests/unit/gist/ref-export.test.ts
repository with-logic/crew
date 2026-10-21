/** Per-entry gist refs export only the literal selected file (§9 step 3, §10.1). */
import { afterEach, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { paths } from "../../../src/core/paths.ts";
import type { TapConfig } from "../../../src/core/types.ts";
import { resetGitRunner } from "../../../src/git/exec.ts";
import { loadSkill } from "../../../src/skill/load.ts";
import { withAcquiredSkillPath } from "../../../src/sources/acquire/index.ts";
import { GIST_URL, gistFixture } from "../../e2e/gist/helpers.ts";
import { commitAll } from "../../helpers/fixtures.ts";

const tap: TapConfig = {
  name: "snippets",
  kind: "git",
  registered: true,
  url: GIST_URL,
  subpath: "",
  path: "",
};
afterEach(resetGitRunner);

for (const filename of [
  "a[1].md",
  ":(glob)*.md",
  "space name.md",
  "SKILL.md",
  "skills",
  ".crew.json",
  "literal?.md",
]) {
  test(`C-GIST-03 selected ref exports only the literal file ${filename}`, () => {
    const f = gistFixture({ [filename]: "selected", "a1.md": "decoy" });
    const original = readFileSync(join(f.repo, filename));
    writeFileSync(join(f.repo, "unrelated-large.bin"), Buffer.alloc(1024 * 1024, 1));
    const sha = commitAll(f.repo, "unrelated file");
    let exported = "";
    withAcquiredSkillPath(tap, sha, filename, f.home, (acquired, file) => {
      exported = file;
      expect(acquired).toEqual({ resolvedSha: sha, pinned: true });
      expect(readFileSync(file)).toEqual(original);
      expect(loadSkill(file, true).frontmatter.name).toBe("selected");
      expect(readdirSync(dirname(file))).toEqual([filename]);
    });
    expect(existsSync(exported)).toBe(false);
    expect(readdirSync(paths(f.home).gitCacheDir)).toEqual([]);
  });
}

test("C-GIST-03 selected ref cleanup also runs when its reader throws", () => {
  const f = gistFixture();
  const error = new Error("reader failed");
  expect(() =>
    withAcquiredSkillPath(tap, f.sha, "prd.md", f.home, () => {
      throw error;
    }),
  ).toThrow(error);
  expect(readdirSync(paths(f.home).gitCacheDir)).toEqual([]);
});

for (const replacement of ["missing", "directory", "symlink"]) {
  test(`C-GIST-04 selected ref refuses a ${replacement} file without directory fallback`, () => {
    const f = gistFixture({ "other.md": "other" });
    if (replacement === "directory") {
      mkdirSync(join(f.repo, "selected.md"));
      writeFileSync(
        join(f.repo, "selected.md", "SKILL.md"),
        "---\nname: selected\ndescription: valid\n---\n",
      );
    }
    if (replacement === "symlink") symlinkSync("other.md", join(f.repo, "selected.md"));
    const sha = commitAll(f.repo, "replacement");
    expect(() =>
      withAcquiredSkillPath(tap, sha, "selected.md", f.home, (_, file) => loadSkill(file, true)),
    ).toThrow(
      expect.objectContaining({
        code: replacement === "missing" ? "no_skills_found" : "invalid_skill",
      }),
    );
    expect(readdirSync(paths(f.home).gitCacheDir)).toEqual([]);
  });
}
