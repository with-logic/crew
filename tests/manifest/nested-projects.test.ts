/**
 * `nestedProjectDirs` and `isOwnProject` (§9.2): which of the candidates
 * git lists are projects of the repository in their own right. Real
 * repositories and real symbolic links.
 */

import { describe, expect, test } from "bun:test";
import { mkdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../../src/core/errors.ts";
import { isOwnProject, nestedProjectDirs } from "../../src/manifest/index.ts";
import { commitAll, makeGitRepo, makeTempDir } from "../helpers/fixtures.ts";

/** Write an empty `.crewrc` in `<root>/<dir>`, creating the directory. */
function addManifest(root: string, dir: string): void {
  mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, dir, ".crewrc"), "");
}

/** A repository with `.crewrc` committed in `packages/api` and `packages/web`. */
function makeRepo(): string {
  const root = realpathSync(makeTempDir("crew-mono-"));
  makeGitRepo(root);
  addManifest(root, "packages/api");
  addManifest(root, "packages/web");
  commitAll(root, "projects");
  return root;
}

/** The code and `details.file` of the `CrewError` that `run` raises. */
function refusal(run: () => unknown): { code: string; file: unknown } {
  try {
    run();
  } catch (err) {
    if (err instanceof CrewError) return { code: err.code, file: err.details["file"] };
  }
  return { code: "(nothing was raised)", file: undefined };
}

describe("nestedProjectDirs", () => {
  test("lists each directory holding a regular .crewrc", () => {
    const root = makeRepo();

    expect(nestedProjectDirs(root)).toEqual([
      join(root, "packages/api"),
      join(root, "packages/web"),
    ]);
  });

  test("passes over a tracked project deleted from the work tree, directory and all", () => {
    const root = makeRepo();
    rmSync(join(root, "packages/api"), { recursive: true });

    expect(nestedProjectDirs(root)).toEqual([join(root, "packages/web")]);
  });

  test("passes over a tracked .crewrc that was deleted while its directory stayed", () => {
    const root = makeRepo();
    rmSync(join(root, "packages/api", ".crewrc"));

    expect(nestedProjectDirs(root)).toEqual([join(root, "packages/web")]);
  });

  test("refuses a .crewrc that is a symbolic link", () => {
    const root = makeRepo();
    const file = join(root, "packages/api", ".crewrc");
    renameSync(file, join(root, "api.crewrc"));
    symlinkSync(join(root, "api.crewrc"), file);

    expect(refusal(() => nestedProjectDirs(root))).toEqual({ code: "manifest_invalid", file });
  });

  test.each([
    ["a directory outside that has a .crewrc", "with-manifest"],
    ["a directory outside that has none", "empty"],
    ["nothing at all", "missing"],
  ])("refuses a project directory replaced by a link to %s", (_what, target) => {
    const root = makeRepo();
    const outside = makeTempDir("crew-outside-");
    addManifest(outside, "with-manifest");
    mkdirSync(join(outside, "empty"));
    rmSync(join(root, "packages/api"), { recursive: true });
    symlinkSync(join(outside, target), join(root, "packages/api"));

    expect(refusal(() => nestedProjectDirs(root))).toEqual({
      code: "manifest_invalid",
      file: join(root, "packages/api", ".crewrc"),
    });
  });

  test("refuses a project whose parent directory was replaced by a link", () => {
    const root = makeRepo();
    const outside = makeTempDir("crew-outside-");
    addManifest(outside, "api");
    addManifest(outside, "web");
    rmSync(join(root, "packages"), { recursive: true });
    symlinkSync(outside, join(root, "packages"));

    expect(refusal(() => nestedProjectDirs(root))).toEqual({
      code: "manifest_invalid",
      file: join(root, "packages/api", ".crewrc"),
    });
  });
});

describe("isOwnProject", () => {
  test("answers for the filesystem as it is when asked", () => {
    const root = makeRepo();
    const api = join(root, "packages/api");
    expect(isOwnProject(root, api)).toBe(true);

    rmSync(join(api, ".crewrc"));
    expect(isOwnProject(root, api)).toBe(false);

    rmSync(api, { recursive: true });
    symlinkSync(makeTempDir("crew-outside-"), api);
    expect(refusal(() => isOwnProject(root, api)).code).toBe("manifest_invalid");
  });
});
