/**
 * Checks repeated right before each deletion (§9.2): the manifest must
 * still be current, and the install directory still the project's own.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, renameSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../../src/cli/main.ts";
import { readState } from "../../../../src/state/load.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { makeTempDir } from "../../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import { crew, makeProject, makeSkillRepo, skillDir, writeManifest } from "../helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

test("C-RC-33 a manifest replaced partway through the removals stops them there", () => {
  const home = makeCrewHome();
  const repo = makeSkillRepo(["alpha", "beta"]);
  const project = makeProject([repo]);
  expect(crew(home, project, ["install"]).code).toBe(0);
  writeManifest(project, []);
  let stderr = "";
  let restored = false;

  // While the first of the two is being removed, the manifest lists them again.
  const code = runCli(["install", "--verbose"], {
    home,
    cwd: project,
    streams: {
      stdout: () => {},
      stderr: (chunk) => {
        stderr += chunk;
        if (restored || !/removing (alpha|beta) /.test(chunk)) return;
        restored = true;
        writeManifest(project, [repo]);
      },
    },
  });

  expect(restored).toBe(true);
  expect(code).toBe(0);
  expect(stderr).toContain("crew stopped reconciling");
  const left = ["alpha", "beta"].filter((name) => existsSync(skillDir(project, name)));
  expect(left).toHaveLength(1);
  expect(readState(home).installations.map((entry) => entry.name)).toEqual(left);
});

test("C-RC-30 a directory that becomes a link after the pre-checks is still not deleted", () => {
  const home = makeCrewHome();
  const project = makeProject([makeSkillRepo(["alpha", "beta"])]);
  expect(crew(home, project, ["install"]).code).toBe(0);
  writeManifest(project, []);
  const elsewhere = makeTempDir("crew-elsewhere-");
  let stderr = "";
  let second: string | null = null;

  // While the first of the two is being removed, swap the other's directory for a link.
  const code = runCli(["install", "--verbose"], {
    home,
    cwd: project,
    streams: {
      stdout: () => {},
      stderr: (chunk) => {
        stderr += chunk;
        const removing = /removing (alpha|beta) /.exec(chunk);
        if (second !== null || removing === null) return;
        second = removing[1] === "alpha" ? "beta" : "alpha";
        renameSync(skillDir(project, second), join(elsewhere, second));
        symlinkSync(join(elsewhere, second), skillDir(project, second));
      },
    },
  });

  expect(second).not.toBeNull();
  const kept = second as unknown as string;
  expect(code).toBe(0);
  expect(stderr).toContain(`kept \`${kept}\``);
  expect(existsSync(join(elsewhere, kept, "SKILL.md"))).toBe(true);
  expect(existsSync(skillDir(project, kept === "alpha" ? "beta" : "alpha"))).toBe(false);
});
