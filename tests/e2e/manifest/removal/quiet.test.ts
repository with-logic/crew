/**
 * `--quiet` and removals (§9.2, §5.2): an aborted removal is still
 * explained on stderr, and a clean run stays silent.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../../helpers/env.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import {
  crew,
  installed,
  makeProject,
  makeSkillRepo,
  skillDir,
  writeManifest,
} from "../helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

/** A project whose one owned skill has been dropped from `.crewrc`; `keep` lists what stays declared. */
function projectWithDroppedAlpha(home: string, keep: readonly string[] = []): string {
  const project = makeProject([makeSkillRepo(["alpha"]), ...keep]);
  if (crew(home, project, ["install"]).code !== 0) throw new Error("setup install failed");
  writeManifest(project, keep);
  return project;
}

for (const [what, keep] of [
  ["an emptied manifest", () => []],
  ["a manifest that still declares a skill", () => [makeSkillRepo(["beta"])]],
] as const) {
  test(`C-RC-25 under --quiet an aborted removal is explained on stderr (${what})`, () => {
    const home = makeCrewHome();
    const project = projectWithDroppedAlpha(home, keep());
    // Without its marker the directory is no longer provably crew's (§7.4).
    rmSync(join(skillDir(project, "alpha"), ".crew.json"));

    const run = crew(home, project, ["install", "--quiet"]);

    expect(run.code).toBe(1);
    expect(run.stdout).toBe("");
    expect(run.stderr).toBe(
      "error: could not remove `alpha` from claude-code (untracked_directory): something else owns that folder (pass --force to remove anyway)\n",
    );
  });
}

test("C-RC-25 under --quiet a removal that succeeds prints nothing", () => {
  const home = makeCrewHome();
  const project = projectWithDroppedAlpha(home);

  expect(existsSync(skillDir(project, "alpha"))).toBe(true);

  const run = crew(home, project, ["install", "--quiet"]);

  expect(run).toEqual({ code: 0, stdout: "", stderr: "" });
  expect(existsSync(skillDir(project, "alpha"))).toBe(false);
  expect(installed(home)).toEqual([]);
});

test("C-RC-25 under --quiet every aborted removal gets its own line", () => {
  const home = makeCrewHome();
  const project = makeProject([makeSkillRepo(["alpha"]), makeSkillRepo(["beta"])]);
  expect(crew(home, project, ["install"]).code).toBe(0);
  writeManifest(project, []);
  rmSync(join(skillDir(project, "alpha"), ".crew.json"));
  rmSync(join(skillDir(project, "beta"), ".crew.json"));

  const run = crew(home, project, ["install", "--quiet"]);

  expect(run.code).toBe(1);
  const lines = run.stderr.trimEnd().split("\n").sort();
  expect(lines).toHaveLength(2);
  expect(lines[0]).toStartWith(
    "error: could not remove `alpha` from claude-code (untracked_directory)",
  );
  expect(lines[1]).toStartWith(
    "error: could not remove `beta` from claude-code (untracked_directory)",
  );
});

test("C-RC-25 under --quiet the line never repeats text read from the install site", () => {
  const home = makeCrewHome();
  const project = projectWithDroppedAlpha(home);
  // A marker that names another skill is inconsistent (§7.4); its name is untrusted text.
  const markerFile = join(skillDir(project, "alpha"), ".crew.json");
  const marker = JSON.parse(readFileSync(markerFile, "utf8")) as Record<string, unknown>;
  writeFileSync(
    markerFile,
    JSON.stringify({ ...marker, name: "https://user:hunter2@example.com/x" }),
  );

  const run = crew(home, project, ["install", "--quiet"]);

  expect(run.code).toBe(1);
  expect(run.stderr).toBe(
    "error: could not remove `alpha` from claude-code (inconsistent_marker): the install site looks tampered with (pass --force to remove)\n",
  );
});

test("C-RC-25 without --quiet an aborted removal is explained in the human report, not twice", () => {
  const home = makeCrewHome();
  const project = projectWithDroppedAlpha(home);
  rmSync(join(skillDir(project, "alpha"), ".crew.json"));

  const run = crew(home, project, ["install"]);

  expect(run.code).toBe(1);
  expect(run.stdout).toContain("something else owns that folder");
  expect(run.stderr).toBe("");
});
