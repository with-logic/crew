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
import type { Config, ResolvedSkill, Scope, StateEntry } from "../core/types.ts";
import { garbageCollectAutoTaps } from "../maintenance/auto-taps.ts";
import type { SkippedSkill } from "../sources/expand.ts";
import { readState, writeState } from "../state/load.ts";
import { withStateLock } from "../state/lock.ts";
import { computeAgentSet } from "./agent-set.ts";
import { type AlreadyInstalled, applyDuplicateRules } from "./duplicate-rules.ts";
import { type InstallSummary, performInstall } from "./perform.ts";
import { promoteExplicit } from "./promote-explicit.ts";
import { applyReattributions, rewriteReattributedMarkers } from "./reattribute.ts";
import { type RequiredByMap, resolveInstallSet } from "./resolve/index.ts";
import type { KindHint } from "./resolve-ref/index.ts";
import { rewriteTapMarkers } from "./rewrite-tap-markers.ts";

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
  /** Opt direct git/path refs into recursive fallback discovery. */
  readonly recursive?: boolean;
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
  /**
   * Skill directories that failed validation and were soft-skipped
   * during multi-skill expansion. Empty for single-skill installs
   * (those hard-fail before reaching here).
   */
  readonly skipped: readonly SkippedSkill[];
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
    skipped,
  } = resolveInstallSet(options.refs, config, {
    cwd,
    home,
    kindHint: options.kindHint ?? null,
    recursive: options.recursive ?? false,
  });

  // Apply §5.4 — duplicate installs. An install with a new active
  // adapter that didn't previously own the entry still has real work
  // to do (attach ownership), so the duplicate short-circuit must
  // consider the active target set.
  const duplicateOptions = {
    activeAgents: agents.map((a) => a.name),
    force: options.force,
    taps: configWithAutoTaps.taps,
  };
  const currentState = readState(home);

  if (options.dryRun) {
    const preview = applyDuplicateRules(
      resolvedAll,
      currentState,
      options.scope,
      cwd,
      duplicateOptions,
    );
    const summary = performInstall(preview.toInstall, agents, options.scope, cwd, currentState, {
      force: options.force,
      dryRun: true,
      requiredBy,
      allResolved: resolvedAll,
    });
    return {
      summary,
      alreadyInstalled: preview.alreadyInstalled,
      resolved: resolvedAll,
      skipped,
    };
  }

  // Everything below decides what to write, so it must run against state
  // read INSIDE the lock: an uninstall landing between an unlocked
  // snapshot and lock acquisition would otherwise let us report a skill
  // as "already installed" that is no longer there.
  let alreadyInstalled: readonly AlreadyInstalled[] = [];
  const summary = withStateLock(() => {
    // Persist any auto-taps the resolver created BEFORE we start
    // writing state entries that reference them — otherwise a partial
    // crash would leave dangling tap names in state.
    if (configWithAutoTaps !== config) writeConfig(configWithAutoTaps, home);

    const freshState = readState(home);
    const analysis = applyDuplicateRules(
      resolvedAll,
      freshState,
      options.scope,
      cwd,
      duplicateOptions,
    );
    const { toInstall, promoteToExplicit, reattributions } = analysis;
    alreadyInstalled = analysis.alreadyInstalled;
    rewriteDiscoveryUpgradeMarkers(config, configWithAutoTaps, freshState.installations, cwd);
    // §5.4: entries that reached the same source through a narrower
    // auto tap move onto the incoming tap before the install runs, so
    // `performInstall` sees the attribution it is about to write.
    rewriteReattributedMarkers(reattributions, configWithAutoTaps.taps, cwd);
    const reattributed = applyReattributions(freshState, reattributions);
    const result = performInstall(toInstall, agents, options.scope, cwd, reattributed, {
      force: options.force,
      dryRun: false,
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
    // An auto tap left with no entries after re-attribution is crew's
    // own bookkeeping and goes away with its clone (§16.5).
    if (reattributions.length > 0) garbageCollectAutoTaps(promoted, home);
    return { ...result, newState: promoted };
  }, home);

  return { summary, alreadyInstalled, resolved: resolvedAll, skipped };
}

function rewriteDiscoveryUpgradeMarkers(
  before: Config,
  after: Config,
  stateEntries: readonly StateEntry[],
  cwd: string,
): void {
  const previous = new Map(before.taps.map((tap) => [tap.name, tap]));
  for (const tap of after.taps) {
    const old = previous.get(tap.name);
    if (!old) continue;
    if (old.discovery === "recursive" || tap.discovery !== "recursive") continue;
    rewriteTapMarkers(
      { oldName: tap.name, newName: tap.name, discovery: "recursive" },
      stateEntries,
      cwd,
    );
  }
}

// Keep `RequiredByMap` exported under this module's name for consumers.
// Re-export `AlreadyInstalled` for legacy callers of this module.
export type { AlreadyInstalled, RequiredByMap };
