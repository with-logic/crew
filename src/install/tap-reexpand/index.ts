/**
 * Tap re-expansion for `crew update` (§10.1.1).
 *
 * For every git-kind tap with at least one state entry attributed to it
 * (filtered by `restrictNames`), walk the tap one level deep and:
 *
 *   1. ADDITIONS — children present upstream but not in state: install
 *      via the caller-provided `installNewChild` callback.
 *   2. SOURCE_GONE — entries in state attributed to this tap whose
 *      directory is no longer present upstream: report; preserve local
 *      install.
 *
 * Existing-and-still-present children are handled by the regular
 * per-skill update loop in `update/entry.ts`.
 *
 * Path-kind taps follow the same algorithm; they just don't fetch and
 * their `resolvedSha` is null.
 *
 * This file drives the group loop; the three per-group passes live in
 * `./group.ts`.
 */

import type { CrewError } from "../../core/errors.ts";
import type { Config, StateEntry, StateFile, TapConfig } from "../../core/types.ts";
import { acquireTap } from "../../sources/acquire/index.ts";
import { isDirectory } from "../../util/fs.ts";
import { buildInstalledSourceIndex } from "../installed-lookup.ts";
import { currentTapChildren, groupChildrenByName } from "../tap-children.ts";
import { installNewChildren, rejectConflictingNames, reportMissingMembers } from "./group.ts";
import type { InstallNewChild, ReexpandSink, TapReexpandResult } from "./types.ts";

export type { InstallNewChild, TapReexpandResult, TapReexpandRow } from "./types.ts";

/** Group state entries by (tap-name, scope, project_root). */
function groupEntries(state: StateFile): ReadonlyMap<string, StateEntry[]> {
  const byKey = new Map<string, StateEntry[]>();
  for (const entry of state.installations) {
    const key = `${entry.source.tap}::${entry.scope}::${entry.project_root ?? ""}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(entry);
    else byKey.set(key, [entry]);
  }
  return byKey;
}

/**
 * Whether this group is in scope for re-expansion: it must have asked
 * for the whole tap, be named by the filter, and — for project scope —
 * still have its project directory.
 */
function groupIsEligible(
  members: readonly StateEntry[],
  tap: TapConfig,
  restrictNames: readonly string[],
): boolean {
  // Whole-tap tracking: only groups whose members asked for the whole
  // tap (either by URL or by tap name) get re-expanded. A user who
  // installed an individual skill doesn't acquire every sibling.
  if (!members.some((m) => m.tracks_tap === true)) return false;
  // Restrict by name filter — re-expand only if the user named a member
  // of this group, or named the tap itself.
  if (restrictNames.length > 0) {
    const memberNames = new Set(members.map((m) => m.name));
    const touches = restrictNames.some((n) => memberNames.has(n));
    if (!(touches || restrictNames.includes(tap.name))) return false;
  }
  const first = members[0]!;
  const projectRoot = first.project_root ?? null;
  return !(first.scope === "project" && projectRoot && !isDirectory(projectRoot));
}

export function reexpandTaps(
  state: StateFile,
  config: Config,
  home: string,
  restrictNames: readonly string[],
  installOne: InstallNewChild,
): TapReexpandResult {
  const sink: ReexpandSink = { added: [], updated: [], sourceGone: new Set(), rows: [] };
  let hardFailure = false;
  // Built once: the per-child same-source check would otherwise rescan
  // every state entry, and every tap row within it, for each candidate.
  const installedIndex = buildInstalledSourceIndex(state, config);

  for (const members of groupEntries(state).values()) {
    const first = members[0]!;
    const tap = config.taps.find((t) => t.name === first.source.tap);
    // Tap was removed from config but state still references it.
    // doctor --repair will rebuild it from markers; here we just skip.
    if (!tap) continue;
    if (!groupIsEligible(members, tap, restrictNames)) continue;

    const projectRoot = first.project_root ?? null;
    let acquired: { rootDir: string; resolvedSha: string | null };
    try {
      acquired = acquireTap(tap, home);
    } catch (err) {
      const ce = err as CrewError;
      for (const m of members) {
        sink.rows.push({
          name: m.name,
          scope: m.scope,
          tap: tap.name,
          kind: "tap_error",
          error: { code: ce.code ?? "source_unreachable", message: ce.message },
        });
      }
      continue;
    }

    const children = currentTapChildren(tap, home, acquired.rootDir);
    const childrenByName = groupChildrenByName(children);
    const conflicted = rejectConflictingNames(childrenByName, tap, first.scope, sink);
    if (conflicted.size > 0) hardFailure = true;
    reportMissingMembers(members, childrenByName, conflicted, tap, sink);
    installNewChildren(
      children,
      members,
      conflicted,
      {
        tap,
        scope: first.scope,
        projectRoot,
        resolvedSha: acquired.resolvedSha,
        installedIndex,
        installOne,
      },
      sink,
    );
  }

  return {
    added: sink.added,
    updated: sink.updated,
    hardFailure,
    sourceGone: sink.sourceGone,
    rows: sink.rows,
  };
}
