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
import { collectionWarnings, garbageCollectAutoTaps } from "../maintenance/auto-taps.ts";
import type { SkippedSkill } from "../sources/expand.ts";
import { readState, writeState } from "../state/load.ts";
import { withStateLock } from "../state/lock.ts";
import { computeAgentSet } from "./agent-set.ts";
import type { AttributionChange } from "./attribution-changes.ts";
import { assertTapsPresent, mergeAutoTaps } from "./config-merge.ts";
import type { AlreadyInstalled } from "./duplicate-rules/index.ts";
import type { InstallSummary } from "./perform/index.ts";
import { planInstall } from "./plan.ts";
import { previewInstall } from "./preview.ts";
import { movesMade } from "./reattribute/index.ts";
import { followMoves, rewriteReattributedMarkers } from "./reattribute/markers.ts";
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
  /** Entries whose tap or tracking the install changed (§5.4, C-INST-13o). */
  readonly changes: readonly AttributionChange[];
  /** Stderr warnings: an auto-tap collection a marker held back (§16.5). */
  readonly warnings: readonly string[];
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
  const installRun = {
    scope: options.scope,
    cwd,
    force: options.force,
    requiredBy,
    duplicates: {
      activeAgents: agents.map((a) => a.name),
      force: options.force,
      taps: configWithAutoTaps.taps,
    },
  };

  if (options.dryRun) {
    const preview = previewInstall(resolvedAll, readState(home), agents, installRun);
    return { ...preview, resolved: resolvedAll, skipped, warnings: [] };
  }

  // Everything below decides what to write, so it must run against state
  // read INSIDE the lock: an uninstall landing between an unlocked
  // snapshot and lock acquisition would otherwise let us report a skill
  // as "already installed" that is no longer there.
  let alreadyInstalled: readonly AlreadyInstalled[] = [];
  let changes: readonly AttributionChange[] = [];
  let warnings: readonly string[] = [];
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
    // §5.4: a move whose markers can't follow is refused before anything
    // — config, a marker, state — is written; then config and the up-front
    // moves' markers are, before the install (`./plan.ts`).
    const plan = planInstall(
      resolvedAll,
      freshState,
      agents,
      { ...installRun, dryRun: false },
      ({ reattributions: upFront }) => {
        if (mergedConfig !== freshConfig) writeConfig(mergedConfig, home);
        rewriteDiscoveryUpgradeMarkers(config, configWithAutoTaps, freshState.installations, cwd);
        rewriteReattributedMarkers(upFront, configWithAutoTaps.taps, cwd);
      },
    );
    const { analysis, summary: result, after: promoted } = plan;
    const { reattributions } = analysis;
    alreadyInstalled = analysis.alreadyInstalled;
    changes = plan.changes;
    // A reinstall that moved its entry wrote the markers it reinstalled;
    // the entry's others — a failed copy's too, where crew can — follow
    // now that it succeeded (§5.4), before state, so an untargeted marker
    // that can't follow (a race past the preflight) leaves it to a retry.
    const madeMoves = movesMade(analysis.movesOnSuccess, promoted);
    followMoves(madeMoves, result.records, agents, configWithAutoTaps.taps, cwd);
    writeState(promoted, home);
    // An auto tap nothing names any more — no entry, no marker — after
    // re-attribution is crew's own bookkeeping, and goes with its clone;
    // one an unreadable marker might name stays, with a warning (§16.5).
    if (reattributions.length + madeMoves.length > 0)
      warnings = collectionWarnings(garbageCollectAutoTaps(promoted, home));
    return { ...result, newState: promoted };
  }, home);

  return { summary, alreadyInstalled, changes, resolved: resolvedAll, skipped, warnings };
}

// Keep `RequiredByMap` exported under this module's name for consumers.
// Re-export `AlreadyInstalled` for legacy callers of this module.
export type { AlreadyInstalled, RequiredByMap };
