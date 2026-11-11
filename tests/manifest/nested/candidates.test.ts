/**
 * `nestedManifestCandidateDirs` (§9.2): the directories beneath a project
 * where git lists a `.crewrc`. Real repositories.
 */

import { describe, expect, test } from "bun:test";
import { mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setGitRunner } from "../../../src/git/exec.ts";
import { nestedManifestCandidateDirs } from "../../../src/manifest/index.ts";
import { commitAll, makeGitRepo, makeTempDir } from "../../helpers/fixtures.ts";
import { addManifest } from "./helpers.ts";

/** A git repository with one commit, as a physical path. */
function makeRepo(): string {
  const root = realpathSync(makeTempDir("crew-mono-"));
  writeFileSync(join(root, "README.md"), "mono\n");
  makeGitRepo(root);
  return root;
}

describe("nestedManifestCandidateDirs", () => {
  test("finds each directory beneath the root that has a .crewrc, committed or not yet added", () => {
    const root = makeRepo();
    addManifest(root, ".");
    addManifest(root, "packages/web");
    addManifest(root, "packages/api");
    commitAll(root, "manifests");
    addManifest(root, "tools/new");

    expect(nestedManifestCandidateDirs(root)).toEqual([
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

    expect(nestedManifestCandidateDirs(root)).toEqual([]);
  });

  test("leaves out what .gitignore excludes", () => {
    const root = makeRepo();
    writeFileSync(join(root, ".gitignore"), "node_modules/\n");
    addManifest(root, "node_modules/some-package");
    addManifest(root, "packages/web");

    expect(nestedManifestCandidateDirs(root)).toEqual([join(root, "packages/web")]);
  });

  test("leaves out a manifest inside another repository nested in this one", () => {
    const root = makeRepo();
    const inner = join(root, "vendor", "other");
    mkdirSync(inner, { recursive: true });
    addManifest(inner, "pkg");
    makeGitRepo(inner);

    expect(nestedManifestCandidateDirs(root)).toEqual([]);
  });

  test("asked from a subdirectory, finds only what is beneath it", () => {
    const root = makeRepo();
    addManifest(root, "packages/web");
    addManifest(root, "packages/web/widgets");
    addManifest(root, "packages/api");

    expect(nestedManifestCandidateDirs(join(root, "packages/web"))).toEqual([
      join(root, "packages/web/widgets"),
    ]);
  });

  test("lists a .crewrc that is a symbolic link; refusing to read one is the loader's job", () => {
    const root = makeRepo();
    mkdirSync(join(root, "packages/web"), { recursive: true });
    writeFileSync(join(root, "shared.crewrc"), "");
    symlinkSync(join(root, "shared.crewrc"), join(root, "packages/web/.crewrc"));

    expect(nestedManifestCandidateDirs(root)).toEqual([join(root, "packages/web")]);
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
      expect(() => nestedManifestCandidateDirs(root)).toThrow("index file corrupt");
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
      expect(() => nestedManifestCandidateDirs(root)).toThrow("dubious ownership");
    } finally {
      setGitRunner(real);
    }
  });

  test("is empty inside a .git directory, which has no work tree", () => {
    const root = makeRepo();
    addManifest(root, "packages/web");

    expect(nestedManifestCandidateDirs(join(root, ".git"))).toEqual([]);
  });

  test("lists a tracked manifest even after it is deleted from the work tree; the caller checks", () => {
    const root = makeRepo();
    addManifest(root, "packages/web");
    addManifest(root, "packages/api");
    commitAll(root, "manifests");
    rmSync(join(root, "packages/api"), { recursive: true });

    expect(nestedManifestCandidateDirs(root)).toEqual([
      join(root, "packages/api"),
      join(root, "packages/web"),
    ]);
  });

  test("a repository git was pointed at and cannot open is raised, not read as 'no repository'", () => {
    const root = makeRepo();
    addManifest(root, "packages/web");
    const before = process.env["GIT_DIR"];
    process.env["GIT_DIR"] = join(root, "no-such-git-dir");
    try {
      expect(() => nestedManifestCandidateDirs(root)).toThrow("not a git repository");
    } finally {
      if (before === undefined) delete process.env["GIT_DIR"];
      else process.env["GIT_DIR"] = before;
    }
  });

  test("is empty outside a git repository", () => {
    const root = realpathSync(makeTempDir("crew-plain-"));
    addManifest(root, "packages/web");

    expect(nestedManifestCandidateDirs(root)).toEqual([]);
  });
});
