/**
 * End-to-end `crew install` flow (§9).
 *
 * This module ties the pieces together:
 *
 *   1. Parse each ref → acquire → validate → expand → resolve deps
 *      (in `./resolve.ts`).
 *   2. Compute the active target set (in `./target-set.ts`).
 *   3. Detect "already installed" and "name conflict" against the current
 *      state (§5.4).
 *   4. Perform the installs (in `./perform.ts`).
 *   5. Write state back under the lock, and return a structured summary
 *      the CLI layer can format.
 */

import { CrewError } from "../core/errors.ts";
import { crewHome } from "../core/paths.ts";
import type { Config, ResolvedSkill, Scope, StateFile } from "../core/types.ts";
import { performInstall, type InstallSummary } from "./perform.ts";
import { resolveInstallSet } from "./resolve.ts";
import { computeTargetSet } from "./target-set.ts";
import { readState, writeState } from "../state/load.ts";
import { withStateLock } from "../state/lock.ts";

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
  readonly alreadyInstalled: readonly string[];
}

/** Run the install flow end-to-end. */
export function runInstall(config: Config, options: InstallOptions): InstallFlowResult {
  const cwd = options.cwd ?? process.cwd();
  const home = options.home ?? crewHome();

  const targets = computeTargetSet(config, options.restrictTargets);

  // Resolve the install set — this stages everything into the store.
  const resolvedAll = resolveInstallSet(options.refs, config, { cwd, home });

  // Apply §5.4 — duplicate installs.
  const currentState = readState(home);
  const { toInstall, alreadyInstalled } = applyDuplicateRules(resolvedAll, currentState, options);

  if (options.dryRun) {
    const summary = performInstall(toInstall, targets, options.scope, cwd, currentState, {
      force: options.force,
      dryRun: true,
      home,
    });
    return { summary, alreadyInstalled };
  }

  const summary = withStateLock(() => {
    const freshState = readState(home);
    const result = performInstall(toInstall, targets, options.scope, cwd, freshState, {
      force: options.force,
      dryRun: false,
      home,
    });
    writeState(result.newState, home);
    return result;
  }, home);

  return { summary, alreadyInstalled };
}

function applyDuplicateRules(
  resolved: readonly ResolvedSkill[],
  state: StateFile,
  options: InstallOptions,
): { toInstall: ResolvedSkill[]; alreadyInstalled: string[] } {
  const toInstall: ResolvedSkill[] = [];
  const alreadyInstalled: string[] = [];

  for (const skill of resolved) {
    const existing = state.installations.find((e) => e.name === skill.name && e.scope === options.scope);
    if (!existing) {
      toInstall.push(skill);
      continue;
    }

    const sameSource = markerSourcesEqual(existing.source, skill.markerSource);
    if (!sameSource) {
      if (!options.force) {
        throw new CrewError(
          "name_conflict",
          `skill \`${skill.name}\` is already installed from a different source; --force does NOT override`,
          { existing: existing.source, incoming: skill.markerSource },
        );
      }
      // Per §5.4 "the previous install is removed first" — but spec also
      // says §13: "--force does NOT override name_conflict." We honor the
      // §13 rule which is the more recent and explicit one (C-INST-14).
      throw new CrewError(
        "name_conflict",
        `skill \`${skill.name}\` is already installed from a different source`,
      );
    }

    if (existing.resolved_sha === skill.resolvedSha && existing.content_hash === skill.contentHash) {
      alreadyInstalled.push(skill.name);
      continue;
    }
    // Same source, different SHA → treat as update.
    toInstall.push(skill);
  }
  return { toInstall, alreadyInstalled };
}

function markerSourcesEqual(a: ResolvedSkill["markerSource"], b: ResolvedSkill["markerSource"]): boolean {
  if (a.type === "tap" && b.type === "tap") return a.tap === b.tap;
  if (a.type === "git" && b.type === "git") return a.url === b.url;
  if (a.type === "path" && b.type === "path") return a.path === b.path;
  return false;
}
