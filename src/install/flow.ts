/**
 * End-to-end `crew install` flow (§9).
 *
 * This module ties the pieces together:
 *
 *   1. Parse each ref → acquire → validate → expand → resolve deps
 *      (in `./resolve.ts`).
 *   2. Compute the active target set (in `./target-set.ts`).
 *   3. Detect "already installed" and "name conflict" against the current
 *      state (§5.4; in `./duplicate-rules.ts`).
 *   4. Perform the installs (in `./perform.ts`).
 *   5. Write state back under the lock, and return a structured summary
 *      the CLI layer can format.
 */

import { writeConfig } from "../config/load.ts";
import { crewHome } from "../core/paths.ts";
import type { Config, ResolvedSkill, Scope, StateFile } from "../core/types.ts";
import { readState, writeState } from "../state/load.ts";
import { withStateLock } from "../state/lock.ts";
import { computeAgentSet } from "./agent-set.ts";
import { type AlreadyInstalled, applyDuplicateRules } from "./duplicate-rules.ts";
import { type InstallSummary, performInstall } from "./perform.ts";
import { type RequiredByMap, resolveInstallSet } from "./resolve/index.ts";
import type { KindHint } from "./resolve-ref/index.ts";

/** Options accepted by `runInstall`. */
export interface InstallOptions {
  readonly refs: readonly string[];
  readonly scope: Scope;
  readonly force: boolean;
  readonly dryRun: boolean;
  readonly restrictAgents: readonly string[];
  readonly cwd?: string;
  readonly home?: string;
  /** Force a reference interpretation (from `--tap` / `--bundle` / `--skill`). */
  readonly kindHint?: KindHint;
}

/** Full result: summary plus any "already installed" short-circuit records. */
export interface InstallFlowResult {
  readonly summary: InstallSummary;
  /** Skills detected as already installed at the same ref / SHA. */
  readonly alreadyInstalled: readonly AlreadyInstalled[];
  /**
   * Every skill the resolver considered (including ones that ended up
   * in `alreadyInstalled`). The CLI layer uses this to look up
   * descriptions, tap attribution, etc. when rendering human output.
   */
  readonly resolved: readonly ResolvedSkill[];
}

/** Run the install flow end-to-end. */
export function runInstall(config: Config, options: InstallOptions): InstallFlowResult {
  const cwd = options.cwd ?? process.cwd();
  const home = options.home ?? crewHome();

  const agents = computeAgentSet(config, options.restrictAgents);

  // Resolve the install set — this stages everything into the store
  // and may extend the config with auto-taps for new git URLs / paths.
  const {
    skills: resolvedAll,
    requiredBy,
    config: configWithAutoTaps,
  } = resolveInstallSet(options.refs, config, { cwd, home, kindHint: options.kindHint ?? null });

  // Apply §5.4 — duplicate installs. An install with a new active
  // adapter that didn't previously own the entry still has real work
  // to do (attach ownership), so the duplicate short-circuit must
  // consider the active target set.
  const currentState = readState(home);
  const { toInstall, alreadyInstalled, promoteToExplicit } = applyDuplicateRules(
    resolvedAll,
    currentState,
    options.scope,
    cwd,
    { activeAgents: agents.map((a) => a.name), force: options.force },
  );

  if (options.dryRun) {
    const summary = performInstall(toInstall, agents, options.scope, cwd, currentState, {
      force: options.force,
      dryRun: true,
      home,
      requiredBy,
      allResolved: resolvedAll,
    });
    return { summary, alreadyInstalled, resolved: resolvedAll };
  }

  const summary = withStateLock(() => {
    // Persist any auto-taps the resolver created BEFORE we start
    // writing state entries that reference them — otherwise a partial
    // crash would leave dangling tap names in state.
    if (configWithAutoTaps !== config) writeConfig(configWithAutoTaps, home);

    const freshState = readState(home);
    const result = performInstall(toInstall, agents, options.scope, cwd, freshState, {
      force: options.force,
      dryRun: false,
      home,
      requiredBy,
      allResolved: resolvedAll,
    });
    const promoted = promoteExplicit(
      result.newState,
      promoteToExplicit,
      options.scope,
      options.scope === "project" ? cwd : null,
    );
    writeState(promoted, home);
    return { ...result, newState: promoted };
  }, home);

  return { summary, alreadyInstalled, resolved: resolvedAll };
}

/**
 * Mark each named (name, scope) state entry as `explicit: true`.
 * Idempotent; any name not present at that scope is silently ignored.
 */
function promoteExplicit(
  state: StateFile,
  names: readonly string[],
  scope: Scope,
  projectRoot: string | null,
): StateFile {
  if (names.length === 0) return state;
  const set = new Set(names);
  return {
    schema_version: 1,
    installations: state.installations.map((e) =>
      e.scope === scope && set.has(e.name) && (e.project_root ?? null) === projectRoot
        ? { ...e, explicit: true }
        : e,
    ),
  };
}

// Keep `RequiredByMap` exported under this module's name for consumers.
// Re-export `AlreadyInstalled` for legacy callers of this module.
export type { AlreadyInstalled, RequiredByMap };
