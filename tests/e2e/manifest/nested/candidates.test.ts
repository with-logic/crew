/**
 * Several manifests in one repository (§9.2): a candidate is applied only
 * when it is a real directory of the repository holding a regular
 * `.crewrc`. Real repositories and real symbolic links.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../../helpers/env.ts";
import { commitAll, makeTempDir } from "../../../helpers/fixtures.ts";
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
});
