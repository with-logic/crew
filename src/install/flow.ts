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
import { readState, writeState } from "../state/load.ts";
import { withStateLock } from "../state/lock.ts";
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

/** A skill that was already installed at the same ref/SHA — no-op. */
export interface AlreadyInstalled {
  readonly name: string;
  /** Ref the existing install was installed from (or null for default). */
  readonly ref: string | null;
  /** Full 40-char resolved SHA, or null for path sources. */
  readonly resolvedSha: string | null;
  readonly scope: Scope;
  readonly targets: readonly string[];
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
    options,
  );

  if (options.dryRun) {
    const summary = performInstall(toInstall, targets, options.scope, cwd, currentState, {
      force: options.force,
      dryRun: true,
      home,
      requiredBy,
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
export type { RequiredByMap };

function applyDuplicateRules(
  resolved: readonly ResolvedSkill[],
  state: StateFile,
  options: InstallOptions,
): {
  toInstall: ResolvedSkill[];
  alreadyInstalled: AlreadyInstalled[];
  promoteToExplicit: string[];
} {
  const toInstall: ResolvedSkill[] = [];
  const alreadyInstalled: AlreadyInstalled[] = [];
  const promoteToExplicit: string[] = [];

  // For project-scope installs, match by (name, scope, project_root).
  // Two project installs of the same skill under different roots are
  // independent entries, not a name conflict. For user scope
  // `project_root` is undefined on both sides → comparison collapses.
  const cwd = options.cwd ?? process.cwd();
  const incomingProjectRoot = options.scope === "project" ? cwd : null;
  for (const skill of resolved) {
    const existing = state.installations.find(
      (e) =>
        e.name === skill.name &&
        e.scope === options.scope &&
        (e.project_root ?? null) === incomingProjectRoot,
    );
    if (!existing) {
      toInstall.push(skill);
      continue;
    }

    const sameSource = markerSourcesEqual(existing.source, skill.markerSource);
    if (!sameSource) {
      // Per §13: --force does NOT override name_conflict, so we throw
      // the same message either way. The user has to remove the old
      // install first, then install from the new source.
      throw new CrewError(
        "name_conflict",
        `a skill named \`${skill.name}\` is already installed from a different source — run \`crew uninstall ${skill.name}\` first, then install from the new source`,
        { existing: existing.source, incoming: skill.markerSource },
      );
    }

    if (
      existing.resolved_sha === skill.resolvedSha &&
      existing.content_hash === skill.contentHash
    ) {
      alreadyInstalled.push({
        name: skill.name,
        ref: existing.ref,
        resolvedSha: existing.resolved_sha,
        scope: existing.scope,
        targets: existing.targets,
      });
      // §11.1: a previously dep-only entry named directly by the user
      // must be promoted to `explicit: true`, even if the SHA is
      // unchanged and no reinstall happens.
      if (skill.explicit && !existing.explicit) {
        promoteToExplicit.push(skill.name);
      }
      continue;
    }
    // Same source, different SHA → treat as update.
    toInstall.push(skill);
  }
  return { toInstall, alreadyInstalled, promoteToExplicit };
}

function markerSourcesEqual(
  a: ResolvedSkill["markerSource"],
  b: ResolvedSkill["markerSource"],
): boolean {
  if (a.type === "tap" && b.type === "tap") return a.tap === b.tap;
  if (a.type === "git" && b.type === "git") return a.url === b.url;
  if (a.type === "path" && b.type === "path") return a.path === b.path;
  return false;
}
