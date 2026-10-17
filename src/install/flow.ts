/**
 * End-to-end `crew install` flow (§9).
 *
 * This module ties the pieces together:
 *
 *   1. Parse each ref → acquire → validate → expand → resolve deps
 *      (in `./resolve.ts`).
 *   2. Compute the active target set (in `./target-set.ts`).
 *   3. Detect "already installed" and "name conflict" against the current
 *      state (§5.4; in `./duplicate-rules/index.ts`).
 *   4. Perform the installs (in `./perform/index.ts`).
 *   5. Write state back under the lock, and return a structured summary
 *      the CLI layer can format.
 */

import { readConfig, writeConfig } from "../config/load.ts";
import { crewHome } from "../core/paths.ts";
import type { Config, ResolvedSkill, Scope } from "../core/types.ts";
import { garbageCollectAutoTaps } from "../maintenance/auto-taps.ts";
import type { SkippedSkill } from "../sources/expand.ts";
import { readState, writeState } from "../state/load.ts";
import { withStateLock } from "../state/lock.ts";
import { computeAgentSet } from "./agent-set.ts";
import { assertTapsPresent, mergeAutoTaps } from "./config-merge.ts";
import { type AlreadyInstalled, applyDuplicateRules } from "./duplicate-rules/index.ts";
import { type InstallSummary, performInstall } from "./perform/index.ts";
import { promoteFlags } from "./promote-flags.ts";
import { applyReattributions, movesMade } from "./reattribute/index.ts";
import { followMoves, rewriteReattributedMarkers } from "./reattribute/markers.ts";
import { preflightMoves } from "./reattribute/preflight.ts";
import { type RequiredByMap, resolveInstallSet } from "./resolve/index.ts";
import type { KindHint } from "./resolve-ref/index.ts";
import { rewriteDiscoveryUpgradeMarkers } from "./rewrite-tap-markers.ts";

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
  /** Soft-skipped candidates; see `ResolveResult.skipped` (`./resolve/index.ts`). */
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
    // The preview refuses what the run would (§5.4).
    preflightMoves(preview, agents, cwd);
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
    // Replay resolver additions onto fresh config under the lock (§14),
    // retaining concurrent removals and rejecting source replacements.
    const freshConfig = readConfig(home);
    const mergedConfig =
      configWithAutoTaps === config
        ? freshConfig
        : mergeAutoTaps(freshConfig, config, configWithAutoTaps);
    assertTapsPresent(mergedConfig, resolvedAll);
    const freshState = readState(home);
    const analysis = applyDuplicateRules(
      resolvedAll,
      freshState,
      options.scope,
      cwd,
      duplicateOptions,
    );
    const { toInstall, reattributions, keepSource } = analysis;
    alreadyInstalled = analysis.alreadyInstalled;
    // §5.4: a move whose markers can't follow is refused before anything
    // — config, a marker, state — is written.
    preflightMoves(analysis, agents, cwd);
    if (mergedConfig !== freshConfig) writeConfig(mergedConfig, home);

    rewriteDiscoveryUpgradeMarkers(config, configWithAutoTaps, freshState.installations, cwd);
    // §5.4: entries the install finds already installed skip
    // `performInstall`, so their moves (state and markers) apply here;
    // moves of reinstalled entries wait for the reinstall to succeed.
    rewriteReattributedMarkers(reattributions, configWithAutoTaps.taps, cwd);
    const reattributed = applyReattributions(freshState, reattributions);
    const result = performInstall(toInstall, agents, options.scope, cwd, reattributed, {
      force: options.force,
      dryRun: false,
      requiredBy,
      allResolved: resolvedAll,
      keepSource,
    });
    const promoted = promoteFlags(
      result.newState,
      analysis.promotions,
      options.scope,
      options.scope === "project" ? cwd : null,
    );
    // A reinstall that moved its entry wrote the markers it reinstalled;
    // the entry's others — a failed copy's too, where crew can — follow
    // now that it succeeded (§5.4), before state, so an untargeted marker
    // that can't follow (a race past the preflight) leaves it to a retry.
    const madeMoves = movesMade(analysis.movesOnSuccess, promoted);
    const stillNamed = followMoves(madeMoves, result.records, agents, configWithAutoTaps.taps, cwd);
    writeState(promoted, home);
    // An auto tap left with no entries after re-attribution is crew's
    // own bookkeeping and goes away with its clone (§16.5) — unless a
    // copy that couldn't follow still names it.
    if (reattributions.length + madeMoves.length > 0)
      garbageCollectAutoTaps(promoted, home, stillNamed);
    return { ...result, newState: promoted };
  }, home);

  return { summary, alreadyInstalled, resolved: resolvedAll, skipped };
}

// Keep `RequiredByMap` exported under this module's name for consumers.
// Re-export `AlreadyInstalled` for legacy callers of this module.
export type { AlreadyInstalled, RequiredByMap };
