/**
 * `nestedManifestDirs` (§9.2): which directories beneath a project have
 * their own `.crewrc`, as git sees the repository. Real repositories.
 */

import { describe, expect, test } from "bun:test";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nestedManifestDirs } from "../../src/manifest/index.ts";
import { commitAll, makeGitRepo, makeTempDir } from "../helpers/fixtures.ts";

/** Write an empty `.crewrc` in `<root>/<dir>`, creating the directory. */
function addManifest(root: string, dir: string): void {
  mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, dir, ".crewrc"), "");
}

/** A git repository with one commit, as a physical path. */
function makeRepo(): string {
  const root = realpathSync(makeTempDir("crew-mono-"));
  writeFileSync(join(root, "README.md"), "mono\n");
  makeGitRepo(root);
  return root;
}

describe("nestedManifestDirs", () => {
  test("finds each directory beneath the root that has a .crewrc, committed or not yet added", () => {
    const root = makeRepo();
    addManifest(root, ".");
    addManifest(root, "packages/web");
    addManifest(root, "packages/api");
    commitAll(root, "manifests");
    addManifest(root, "tools/new");

    expect(nestedManifestDirs(root)).toEqual([
      join(root, "packages/api"),
      join(root, "packages/web"),
      join(root, "tools/new"),
    ]);
  });

  test("does not count the root's own manifest, or a file that only ends in .crewrc", () => {
    const root = makeRepo();
    addManifest(root, ".");
    mkdirSync(join(root, "docs"));
    writeFileSync(join(root, "docs", "example.crewrc"), "");

    expect(nestedManifestDirs(root)).toEqual([]);
  });

  test("leaves out what .gitignore excludes", () => {
    const root = makeRepo();
    writeFileSync(join(root, ".gitignore"), "node_modules/\n");
    addManifest(root, "node_modules/some-package");
    addManifest(root, "packages/web");

    expect(nestedManifestDirs(root)).toEqual([join(root, "packages/web")]);
  });

  test("leaves out a manifest inside another repository nested in this one", () => {
    const root = makeRepo();
    const inner = join(root, "vendor", "other");
    mkdirSync(inner, { recursive: true });
    addManifest(inner, "pkg");
    makeGitRepo(inner);

    expect(nestedManifestDirs(root)).toEqual([]);
  });

  test("asked from a subdirectory, finds only what is beneath it", () => {
    const root = makeRepo();
    addManifest(root, "packages/web");
    addManifest(root, "packages/web/widgets");
    addManifest(root, "packages/api");

    expect(nestedManifestDirs(join(root, "packages/web"))).toEqual([
      join(root, "packages/web/widgets"),
    ]);
  });

  test("is empty outside a git repository", () => {
    const root = realpathSync(makeTempDir("crew-plain-"));
    addManifest(root, "packages/web");

    expect(nestedManifestDirs(root)).toEqual([]);
  });
});
