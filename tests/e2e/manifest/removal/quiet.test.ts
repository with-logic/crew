/**
 * `--quiet` and removals (§9.2, §5.2): an aborted removal is still
 * explained on stderr, and a clean run stays silent.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../../helpers/env.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import { crew, makeProject, makeSkillRepo, skillDir, writeManifest } from "../helpers.ts";

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
    const dir = skillDir(project, "alpha");
    expect(run.stderr).toBe(
      `error: could not remove \`alpha\` from claude-code (untracked_directory): \`${dir}\` exists but isn't crew-managed (no .crew.json) — refusing to remove (pass --force to remove it anyway)\n`,
    );
  });
}

test("C-RC-25 under --quiet a removal that succeeds prints nothing", () => {
  const home = makeCrewHome();
  const project = projectWithDroppedAlpha(home);

  const run = crew(home, project, ["install", "--quiet"]);

  expect(run).toEqual({ code: 0, stdout: "", stderr: "" });
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
