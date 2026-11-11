/**
 * Several manifests in one repository (§9.2): a candidate is applied only
 * when it is a real directory of the repository holding a regular
 * `.crewrc`. Real repositories and real symbolic links.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../../helpers/env.ts";
import { commitAll, makeGitRepo, makeTempDir } from "../../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import { crew, installed, makeSkillRepo, skillDir, writeManifest } from "../helpers.ts";
import { makeMonorepo } from "./helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

/** The name and file of the error a failed `--json` run reported. */
function errorOf(stdout: string): { name: string; file: unknown } {
  const { error } = JSON.parse(stdout) as {
    error: { name: string; details: { file?: unknown } };
  };
  return { name: error.name, file: error.details.file };
}

describe("nested manifest candidates", () => {
  test("C-RC-62 a project directory replaced by a link out of the repository is refused, and nothing is installed", () => {
    const home = makeCrewHome();
    const root = makeMonorepo({
      ".": [makeSkillRepo(["alpha"])],
      "packages/api": [makeSkillRepo(["beta"])],
    });
    commitAll(root, "projects");
    // git still lists packages/api/.crewrc, but the directory is now someone else's.
    const outside = makeTempDir("crew-outside-");
    writeManifest(outside, [makeSkillRepo(["gamma"])]);
    rmSync(join(root, "packages/api"), { recursive: true });
    symlinkSync(outside, join(root, "packages/api"));

    const run = crew(home, root, ["install", "--json"]);

    expect(run.code).toBe(4);
    expect(errorOf(run.stdout)).toEqual({
      name: "manifest_invalid",
      file: join(root, "packages/api", ".crewrc"),
    });
    expect(installed(home)).toEqual([]);
    expect(existsSync(skillDir(outside, "gamma"))).toBe(false);
  });

  test.each([
    ["a directory with no .crewrc", (outside: string) => outside],
    ["nothing at all", (outside: string) => join(outside, "missing")],
  ])(
    "C-RC-62 a project directory replaced by a link to %s is refused, not taken for deleted",
    (_what, targetIn) => {
      const home = makeCrewHome();
      const root = makeMonorepo({
        ".": [makeSkillRepo(["alpha"])],
        "packages/api": [makeSkillRepo(["beta"])],
      });
      commitAll(root, "projects");
      rmSync(join(root, "packages/api"), { recursive: true });
      symlinkSync(targetIn(makeTempDir("crew-outside-")), join(root, "packages/api"));

      const run = crew(home, root, ["install", "--json"]);

      expect(run.code).toBe(4);
      expect(errorOf(run.stdout)).toEqual({
        name: "manifest_invalid",
        file: join(root, "packages/api", ".crewrc"),
      });
      expect(installed(home)).toEqual([]);
    },
  );

  test("C-RC-62 a project whose parent directory was replaced by a link is refused", () => {
    const home = makeCrewHome();
    const root = makeMonorepo({
      ".": [makeSkillRepo(["alpha"])],
      "packages/api": [makeSkillRepo(["beta"])],
    });
    commitAll(root, "projects");
    const outside = makeTempDir("crew-outside-");
    mkdirSync(join(outside, "api"));
    writeManifest(join(outside, "api"), [makeSkillRepo(["gamma"])]);
    rmSync(join(root, "packages"), { recursive: true });
    symlinkSync(outside, join(root, "packages"));

    const run = crew(home, root, ["install", "--json"]);

    expect(run.code).toBe(4);
    expect(errorOf(run.stdout)).toEqual({
      name: "manifest_invalid",
      file: join(root, "packages/api", ".crewrc"),
    });
    expect(installed(home)).toEqual([]);
    expect(existsSync(skillDir(join(outside, "api"), "gamma"))).toBe(false);
  });

  test("C-RC-62 a nested .crewrc that is a symbolic link is refused, not skipped in favor of its parent's", () => {
    const home = makeCrewHome();
    const root = makeMonorepo({
      ".": [makeSkillRepo(["alpha"])],
      "packages/api": [makeSkillRepo(["beta"])],
    });
    const file = join(root, "packages/api", ".crewrc");
    renameSync(file, join(root, "api.crewrc"));
    symlinkSync(join(root, "api.crewrc"), file);

    const run = crew(home, root, ["install", "--json"]);

    expect(run.code).toBe(4);
    expect(errorOf(run.stdout)).toEqual({ name: "manifest_invalid", file });
    expect(installed(home)).toEqual([]);
  });

  test("C-RC-62 a tracked project that has been deleted from the work tree is passed over", () => {
    const home = makeCrewHome();
    const root = makeMonorepo({
      ".": [makeSkillRepo(["alpha"])],
      "packages/api": [makeSkillRepo(["beta"])],
    });
    commitAll(root, "projects");
    rmSync(join(root, "packages/api"), { recursive: true });

    const run = crew(home, root, ["install", "--json"]);

    expect(run.code).toBe(0);
    expect((JSON.parse(run.stdout) as { nested?: unknown }).nested).toBeUndefined();
    expect(installed(home)).toEqual([`alpha@${root}`]);
  });

  test("C-RC-62 a tracked .crewrc deleted while its directory stays is passed over too", () => {
    const home = makeCrewHome();
    const root = makeMonorepo({
      ".": [makeSkillRepo(["alpha"])],
      "packages/api": [makeSkillRepo(["beta"])],
      "packages/web": [makeSkillRepo(["gamma"])],
    });
    commitAll(root, "projects");
    rmSync(join(root, "packages/api", ".crewrc"));

    const run = crew(home, root, ["install"]);

    expect(run.code).toBe(0);
    expect(installed(home)).toEqual([`alpha@${root}`, `gamma@${join(root, "packages/web")}`]);
  });

  test("C-RC-62 a tracked project whose directory became its own repository is passed over", () => {
    const home = makeCrewHome();
    const root = makeMonorepo({
      ".": [makeSkillRepo(["alpha"])],
      "vendor/tool": [makeSkillRepo(["beta"])],
      "vendor/tool/docs": [makeSkillRepo(["gamma"])],
    });
    commitAll(root, "projects");
    // The outer index still lists both manifests; the directory is another repository now.
    makeGitRepo(join(root, "vendor/tool"));

    const run = crew(home, root, ["install"]);

    expect(run.code).toBe(0);
    expect(installed(home)).toEqual([`alpha@${root}`]);
  });

  test.each([
    ["a positional reference", (repo: string) => ["install", "--scope", "project", repo]],
    ["--from-git", (repo: string) => ["install", "--scope", "project", "--from-git", repo]],
  ])("C-RC-59 an install with %s does not look for nested manifests", (_what, args) => {
    const home = makeCrewHome();
    const root = makeMonorepo({ ".": [], "packages/api": [makeSkillRepo(["beta"])] });
    // A candidate a bare install would refuse: this run must not even look.
    const file = join(root, "packages/api", ".crewrc");
    renameSync(file, join(root, "api.crewrc"));
    symlinkSync(join(root, "api.crewrc"), file);

    const run = crew(home, root, [...args(makeSkillRepo(["alpha"])), "--json"]);

    expect(run.code).toBe(0);
    expect((JSON.parse(run.stdout) as { nested?: unknown }).nested).toBeUndefined();
    expect(installed(home)).toEqual([`alpha@${root}`]);
  });
});
