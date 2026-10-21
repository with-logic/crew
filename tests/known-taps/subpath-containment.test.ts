/**
 * Known-tap build subpaths stay inside the pinned commit (§9 step 3, §16.2.1).
 */

import { expect, test } from "bun:test";
import { lstatSync, mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { buildKnownTapRegistry } from "../../src/known-taps/build/index.ts";
import type { KnownTapSource } from "../../src/known-taps/build/types.ts";
import { makeGitRepo, makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

test("known-tap builds reject a subpath with a symlinked ancestor", () => {
  const root = makeTempDir("crew-known-taps-subpath-link-");
  const repo = join(root, "repo");
  mkdirSync(repo);
  makeSkill(join(root, "outside", "catalog"), "escaped", skillFrontmatter({ name: "escaped" }));
  symlinkSync(join(root, "outside"), join(repo, "linked"));
  const commit = makeGitRepo(repo).sha;
  const subpath = "linked/catalog";
  expect(lstatSync(join(repo, subpath)).isDirectory()).toBe(true);
  expect(lstatSync(join(repo, subpath)).isSymbolicLink()).toBe(false);

  expect(() =>
    buildKnownTapRegistry(
      { version: 1, taps: [source(repo, subpath, commit)] },
      { workDir: join(root, "work") },
    ),
  ).toThrow("resolves through a symlink");
});

test("known-tap builds index ordinary multi-segment subpaths", () => {
  const root = makeTempDir("crew-known-taps-subpath-directory-");
  const repo = join(root, "repo");
  makeSkill(join(repo, "catalog", "nested"), "contained", skillFrontmatter({ name: "contained" }));
  const commit = makeGitRepo(repo).sha;

  const registry = buildKnownTapRegistry(
    { version: 1, taps: [source(repo, "catalog/nested", commit)] },
    { workDir: join(root, "work") },
  );

  expect(registry[0]?.skills.map((skill) => ({ name: skill.name, path: skill.path }))).toEqual([
    { name: "contained", path: "contained" },
  ]);
});

function source(repo: string, subpath: string, commit: string): KnownTapSource {
  return {
    name: "example",
    url: `file://${repo}`,
    subpath,
    commit,
    description: "Local pinned source",
    trust: "curated",
  };
}
