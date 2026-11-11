/**
 * `nestedManifestDirs` (§9.2): which directories beneath a project have
 * their own `.crewrc`, as git sees the repository. Real repositories.
 */

import { describe, expect, test } from "bun:test";
import { mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setGitRunner } from "../../src/git/exec.ts";
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

  test("lists a .crewrc that is a symbolic link; refusing to read one is the loader's job", () => {
    const root = makeRepo();
    mkdirSync(join(root, "packages/web"), { recursive: true });
    writeFileSync(join(root, "shared.crewrc"), "");
    symlinkSync(join(root, "shared.crewrc"), join(root, "packages/web/.crewrc"));

    expect(nestedManifestDirs(root)).toEqual([join(root, "packages/web")]);
  });

  test("inside a repository, a failure to list its files is raised, not read as none", () => {
    const root = makeRepo();
    addManifest(root, "packages/web");
    const real = setGitRunner((args, options) =>
      args[0] === "ls-files"
        ? { stdout: "", stderr: "fatal: index file corrupt", exitCode: 128 }
        : real(args, options),
    );
    try {
      expect(() => nestedManifestDirs(root)).toThrow("index file corrupt");
    } finally {
      setGitRunner(real);
    }
  });

  test("a git failure other than 'not a repository' is raised, not read as none", () => {
    const root = makeRepo();
    addManifest(root, "packages/web");
    const real = setGitRunner((args, options) =>
      args[0] === "rev-parse"
        ? { stdout: "", stderr: "fatal: detected dubious ownership in repository", exitCode: 128 }
        : real(args, options),
    );
    try {
      expect(() => nestedManifestDirs(root)).toThrow("dubious ownership");
    } finally {
      setGitRunner(real);
    }
  });

  test("is empty inside a .git directory, which has no work tree", () => {
    const root = makeRepo();
    addManifest(root, "packages/web");

    expect(nestedManifestDirs(join(root, ".git"))).toEqual([]);
  });

  test("lists a tracked manifest even after it is deleted from the work tree; the caller checks", () => {
    const root = makeRepo();
    addManifest(root, "packages/web");
    addManifest(root, "packages/api");
    commitAll(root, "manifests");
    rmSync(join(root, "packages/api"), { recursive: true });

    expect(nestedManifestDirs(root)).toEqual([
      join(root, "packages/api"),
      join(root, "packages/web"),
    ]);
  });

  test("is empty outside a git repository", () => {
    const root = realpathSync(makeTempDir("crew-plain-"));
    addManifest(root, "packages/web");

    expect(nestedManifestDirs(root)).toEqual([]);
  });
});
