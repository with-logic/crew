/**
 * Fixtures for the removal sweep tests (§9.2): a real project whose
 * `.crewrc` installed real skills, and a direct call to the sweep.
 */

import { processDroppedEntries } from "../../../src/commands/install/manifest/removal/index.ts";
import type { CommandContext } from "../../../src/commands/types.ts";
import type { StateFile } from "../../../src/core/types.ts";
import { readState } from "../../../src/state/load.ts";
import { makeStyler } from "../../../src/util/term.ts";
import { addSkillsWithDependencies, crew, makeProject } from "../../e2e/manifest/helpers.ts";
import { makeCrewHome } from "../../helpers/env.ts";

export interface Installed {
  readonly home: string;
  readonly project: string;
}

/**
 * A project whose `.crewrc` lists `./tools/<name>` for each of `declared`,
 * bare-installed. `dependenciesBySkill` names every skill under `tools/`
 * and the one skill it depends on, or null. Pass `home` to share one crew
 * home between projects.
 */
export function installProject(
  dependenciesBySkill: Record<string, string | null>,
  declared: readonly string[],
  home: string = makeCrewHome(),
): Installed {
  const project = makeProject(declared.map((name) => `./tools/${name}`));
  addSkillsWithDependencies(project, dependenciesBySkill);
  const run = crew(home, project, ["install"]);
  if (run.code !== 0) throw new Error(run.stderr);
  return { home, project };
}

/** The sweep never prompts, so these are never called. */
const NO_PROMPTS = {
  prompt: undefined as unknown as CommandContext["prompt"],
  promptChoice: undefined as unknown as CommandContext["promptChoice"],
};

export interface SweepOptions {
  /** Names in the manifest's resolved install set; default none, so everything owned is dropped. */
  readonly resolved?: readonly string[];
  readonly dryRun?: boolean;
  readonly force?: boolean;
  /** Called each time the sweep asks whether the manifest is still current, with the call's number from 1. */
  readonly isStillCurrent?: (call: number) => boolean;
}

/** Run the sweep over the state on disk; returns its outcome and that starting state. */
export function sweep(installed: Installed, options: SweepOptions = {}) {
  const { home, project } = installed;
  const ctx: CommandContext = {
    positional: [],
    flags: {
      scope: "user",
      scopeGiven: false,
      agent: [],
      dryRun: options.dryRun ?? false,
      json: false,
      quiet: false,
      verbose: false,
      yes: false,
      force: options.force ?? false,
      extras: {},
    },
    cwd: project,
    home,
    style: makeStyler(false),
    width: 80,
    ...NO_PROMPTS,
  };
  const before: StateFile = readState(home);
  let calls = 0;
  const outcome = processDroppedEntries(before, {
    ctx,
    projectRoot: project,
    resolvedSkillNames: new Set(options.resolved ?? []),
    isStillCurrent: () => {
      calls += 1;
      return options.isStillCurrent?.(calls) ?? true;
    },
  });
  return { outcome, before };
}

/** Names of the entries in `state`, sorted. */
export function namesIn(state: StateFile): string[] {
  return state.installations.map((entry) => entry.name).sort();
}
