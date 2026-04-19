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

import { crewHome } from "../core/paths.ts";
import type { Config, Scope, StateFile } from "../core/types.ts";
import { readState, writeState } from "../state/load.ts";
import { withStateLock } from "../state/lock.ts";
import { type AlreadyInstalled, applyDuplicateRules } from "./duplicate-rules.ts";
import { type InstallSummary, performInstall } from "./perform.ts";
import { type RequiredByMap, resolveInstallSet } from "./resolve.ts";
import { computeTargetSet } from "./target-set.ts";

/** Options accepted by `runInstall`. */
export interface InstallOptions {
  readonly refs: readonly string[];
  readonly scope: Scope;
  readonly force: boolean;
  readonly dryRun: boolean;
  readonly restrictTargets: readonly string[];
  readonly cwd?: string;
  readonly home?: string;
}

/** Full result: summary plus any "already installed" short-circuit records. */
export interface InstallFlowResult {
  readonly summary: InstallSummary;
  /** Skills detected as already installed at the same ref / SHA. */
  readonly alreadyInstalled: readonly AlreadyInstalled[];
}

/** Run the install flow end-to-end. */
export function runInstall(config: Config, options: InstallOptions): InstallFlowResult {
  const cwd = options.cwd ?? process.cwd();
  const home = options.home ?? crewHome();

  const targets = computeTargetSet(config, options.restrictTargets);

  // Resolve the install set — this stages everything into the store.
  const { skills: resolvedAll, requiredBy } = resolveInstallSet(options.refs, config, {
    cwd,
    home,
  });

  // Apply §5.4 — duplicate installs.
  const currentState = readState(home);
  const { toInstall, alreadyInstalled, promoteToExplicit } = applyDuplicateRules(
    resolvedAll,
    currentState,
    options.scope,
    cwd,
  );

  if (options.dryRun) {
    const summary = performInstall(toInstall, targets, options.scope, cwd, currentState, {
      force: options.force,
      dryRun: true,
      home,
      requiredBy,
      allResolved: resolvedAll,
    });
    return { summary, alreadyInstalled };
  }

  const summary = withStateLock(() => {
    const freshState = readState(home);
    const result = performInstall(toInstall, targets, options.scope, cwd, freshState, {
      force: options.force,
      dryRun: false,
      home,
      requiredBy,
      allResolved: resolvedAll,
    });
    // Apply explicit promotions for skills that were `already installed`
    // but are now being named directly. Scope to this install's
    // project_root so we don't accidentally flip the explicit flag on
    // the same-named entry in a different project.
    const promoted = promoteExplicit(
      result.newState,
      promoteToExplicit,
      options.scope,
      options.scope === "project" ? cwd : null,
    );
    writeState(promoted, home);
    return { ...result, newState: promoted };
  }, home);

  return { summary, alreadyInstalled };
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
