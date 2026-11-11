/**
 * The last manifest check before deletion (§9.2): if `.crewrc` stops being
 * current while dropped entries are being pre-checked, nothing is removed.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { processDroppedEntries } from "../../../../src/commands/install/manifest/removal/index.ts";
import type { CommandContext } from "../../../../src/commands/types.ts";
import { readState } from "../../../../src/state/load.ts";
import { makeStyler } from "../../../../src/util/term.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import { crew, makeProject, makeSkillRepo, skillDir } from "../helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

test("C-RC-33 a manifest that stops being current during the pre-checks costs no skill", () => {
  const home = makeCrewHome();
  const project = makeProject([makeSkillRepo(["alpha"])]);
  expect(crew(home, project, ["install"]).code).toBe(0);
  const stateBefore = readFileSync(join(home, "state.json"), "utf8");
  const ctx = {
    positional: [],
    flags: {
      scope: "project",
      scopeGiven: false,
      agent: [],
      dryRun: false,
      json: false,
      quiet: false,
      verbose: false,
      yes: false,
      force: false,
      extras: {},
    },
    cwd: project,
    home,
    style: makeStyler(false),
    width: 80,
    // Removal never prompts, so the prompt functions are left out.
  } as unknown as CommandContext;
  // Current when removal starts, not current by the time the pre-checks finish.
  const answers = [true, false];

  const outcome = processDroppedEntries(readState(home), {
    ctx,
    projectRoot: project,
    resolvedSkillNames: new Set(),
    isStillCurrent: () => answers.shift() ?? false,
  });

  expect(outcome).toBeNull();
  expect(answers).toEqual([]);
  expect(existsSync(join(skillDir(project, "alpha"), "SKILL.md"))).toBe(true);
  expect(readFileSync(join(home, "state.json"), "utf8")).toBe(stateBefore);
});
