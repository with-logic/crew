/**
 * Several manifests in one repository (§9.2): a project is checked again
 * immediately before it is installed, and its install must find exactly
 * the manifest that was checked.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { manifestForBareInstall } from "../../../../src/commands/install/manifest/index.ts";
import type { CommandContext, CommandFlags } from "../../../../src/commands/types.ts";
import { CrewError } from "../../../../src/core/errors.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { makeTempDir } from "../../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import {
  installed,
  makeProject,
  makeSkillRepo,
  runBareInstallWithProgressHook,
} from "../helpers.ts";
import { makeMonorepo } from "./helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

describe("a project that changes while an earlier one installs", () => {
  test.each([
    ["is removed", (api: string) => rmSync(api, { recursive: true })],
    [
      "becomes a link out of the repository",
      (api: string) => {
        rmSync(api, { recursive: true });
        symlinkSync(makeTempDir("crew-outside-"), api);
      },
    ],
  ])(
    "C-RC-62 a project that %s fails the run at its turn; the earlier project stays",
    (_what, change) => {
      const home = makeCrewHome();
      const root = makeMonorepo({
        ".": [makeSkillRepo(["alpha"])],
        "packages/api": [makeSkillRepo(["beta"])],
      });
      const api = join(root, "packages/api");

      // The root project is installing when packages/api changes.
      const run = runBareInstallWithProgressHook(home, root, () => change(api), ["--json"]);

      expect(run).toMatchObject({ code: 4, hookRan: true });
      const { error } = JSON.parse(run.stdout) as {
        error: { name: string; details: { file: string } };
      };
      expect(error.name).toBe("manifest_invalid");
      expect(error.details.file).toBe(join(api, ".crewrc"));
      expect(installed(home)).toEqual([`alpha@${root}`]);
    },
  );
});

describe("an install told which manifest it must find", () => {
  /** What a bare install run in `cwd`, with no flags, hands the check. */
  function bareInstallIn(cwd: string): Pick<CommandContext, "cwd" | "flags"> {
    const flags: CommandFlags = {
      scope: "user",
      scopeGiven: false,
      agent: [],
      dryRun: false,
      json: false,
      quiet: false,
      verbose: false,
      yes: false,
      force: false,
      extras: {},
    };
    return { cwd, flags };
  }

  /** The error `check` raises, or undefined. */
  function errorFrom(check: () => unknown): unknown {
    let thrown: unknown;
    try {
      check();
    } catch (err) {
      thrown = err;
    }
    return thrown;
  }

  test("C-RC-62 accepts that manifest, and refuses any other as manifest_invalid", () => {
    const project = makeProject([makeSkillRepo(["alpha"])]);
    const own = join(project, ".crewrc");
    const other = join(project, "packages/api", ".crewrc");

    expect(manifestForBareInstall(bareInstallIn(project), own).file).toBe(own);

    const thrown = errorFrom(() => manifestForBareInstall(bareInstallIn(project), other));
    expect(thrown).toBeInstanceOf(CrewError);
    expect((thrown as CrewError).code).toBe("manifest_invalid");
    expect((thrown as CrewError).details).toEqual({ file: other });
  });

  test("C-RC-62 refuses as manifest_invalid, not a usage error, when that manifest is gone", () => {
    const project = makeProject([makeSkillRepo(["alpha"])]);
    const own = join(project, ".crewrc");
    rmSync(own);

    const thrown = errorFrom(() => manifestForBareInstall(bareInstallIn(project), own));
    expect(thrown).toBeInstanceOf(CrewError);
    expect((thrown as CrewError).code).toBe("manifest_invalid");
    expect((thrown as CrewError).details).toEqual({ file: own });
  });
});
