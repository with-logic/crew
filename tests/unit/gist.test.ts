/** Gist layout selection, validated candidates, and explicit file loading (§8.2, §9; C-GIST-01/03). */

import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../../src/core/errors.ts";
import { makeTapScanCache } from "../../src/install/tap-reexpand/scan-cache.ts";
import { parseRef } from "../../src/refs/parse.ts";
import { loadSkill } from "../../src/skill/load.ts";
import { expandSkills } from "../../src/sources/expand.ts";
import { isGistTap, scanGist } from "../../src/sources/gist.ts";
import { GIST_URL, gistFile } from "../e2e/gist/helpers.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

test("C-GIST-01 owner/id URLs preserve git identity, SHA tails, and ordinary references", () => {
  const sha = "a".repeat(40);
  expect(parseRef(`${GIST_URL}@${sha}`)).toEqual({
    type: "git",
    url: GIST_URL,
    ref: sha,
    subpath: "",
  });
  expect(isGistTap({ kind: "git", url: GIST_URL })).toBe(true);
  for (const url of [
    "https://example.com/owner/repo",
    "https://gist.github.com.evil.test/owner/id",
    "git@gist.github.com:owner/id",
  ]) {
    expect(isGistTap({ kind: "git", url })).toBe(false);
  }
  expect(isGistTap({ kind: "path", url: GIST_URL })).toBe(false);
  expect(parseRef("https://github.com/acme/repo")).toEqual({
    type: "git",
    url: "https://github.com/acme/repo",
    ref: null,
    subpath: "",
  });
  expect(parseRef("file:///tmp/crew-repo")).toEqual({
    type: "git",
    url: "file:///tmp/crew-repo",
    ref: null,
    subpath: "",
  });
});

test("C-GIST-03 validates every filename and ignores invalid files, directories, and symlinks", () => {
  const root = makeTempDir();
  writeFileSync(join(root, "SKILL.md"), gistFile("root"));
  writeFileSync(join(root, "skills"), gistFile("sibling"));
  writeFileSync(join(root, "README"), "readme");
  writeFileSync(join(root, "bad.yaml"), "---\nname: [unterminated\n---\n");
  writeFileSync(join(root, "missing"), "---\nname: missing\n---\n");
  makeSkill(root, "directory", skillFrontmatter({ name: "directory" }));
  symlinkSync(join(root, "SKILL.md"), join(root, "link"));
  expect(
    scanGist(root)
      .map((skill) => skill.frontmatter.name)
      .sort(),
  ).toEqual(["root", "sibling"]);
  expect(expandSkills(root, { gist: true }).skipped).toEqual([]);
});

test("C-GIST-03 empty valid set produces no_skills_found", () => {
  const root = makeTempDir();
  writeFileSync(join(root, "README"), "readme");
  expect(() => expandSkills(root, { gist: true })).toThrow("no valid skills found");
});

test("C-GIST-03 explicit file mode rejects directories, symlinks, and special files", () => {
  const root = makeTempDir();
  const dir = makeSkill(root, "directory", skillFrontmatter({ name: "directory" }));
  symlinkSync(dir, join(root, "link"));
  const fifo = join(root, "fifo");
  expect(Bun.spawnSync(["mkfifo", fifo]).exitCode).toBe(0);
  for (const path of [dir, join(root, "link"), fifo]) {
    expect(() => loadSkill(path, true)).toThrow("must be a regular file");
  }
});

test("C-GIST-03 scanner propagates file I/O failures", () => {
  const root = makeTempDir();
  const file = join(root, "skill.md");
  writeFileSync(file, gistFile("unreadable"));
  chmodSync(file, 0);
  try {
    expect(() => scanGist(root)).toThrow(/EACCES/);
  } finally {
    chmodSync(file, 0o600);
  }
});

test("C-GIST-03 scan cache retains explicit file mode in its validation key", () => {
  const root = makeTempDir();
  mkdirSync(join(root, "SKILL.md"));
  const cache = makeTapScanCache();
  expect(cache.validate(root, true)).toBeInstanceOf(CrewError);
  expect(() => cache.validate(root)).toThrow(/EISDIR/);
});
