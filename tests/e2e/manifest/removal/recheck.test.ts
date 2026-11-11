/**
 * The manifest is confirmed again right before each deletion (§9.2).
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { runCli } from "../../../../src/cli/main.ts";
import { readState } from "../../../../src/state/load.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import {
  crew,
  makeProject,
  makeSkillRepo,
  ownedNames,
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

test("C-RC-33 a manifest replaced partway through the removals stops them there", () => {
  const home = makeCrewHome();
  const repo = makeSkillRepo(["alpha", "beta"]);
  const project = makeProject([repo]);
  expect(crew(home, project, ["install"]).code).toBe(0);
  writeManifest(project, []);
  let stdout = "";
  let restored = false;

  // While the first of the two is being removed, the manifest lists them again.
  const code = runCli(["install", "--verbose", "--json"], {
    home,
    cwd: project,
    streams: {
      stdout: (chunk) => {
        stdout += chunk;
      },
      stderr: (chunk) => {
        if (restored || !/removing (alpha|beta) /.test(chunk)) return;
        restored = true;
        writeManifest(project, [repo]);
      },
    },
  });

  expect(restored).toBe(true);
  expect(code).toBe(0);
  const left = ["alpha", "beta"].filter((name) => existsSync(skillDir(project, name)));
  expect(left).toHaveLength(1);
  const gone = left[0] === "alpha" ? "beta" : "alpha";
  const { removed, warnings } = JSON.parse(stdout) as {
    removed: { name: string; failures: unknown[] }[];
    warnings: string[];
  };
  expect(warnings.join("\n")).toContain("crew stopped bringing the project in line");
  expect(removed).toMatchObject([{ name: gone, failures: [] }]);
  expect(readState(home).installations.map((entry) => entry.name)).toEqual(left);
  expect(ownedNames(home)).toEqual(left);
});
