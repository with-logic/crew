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
 * This file owns grouping and filtering; the per-group walk — which
 * materializes the group's ref — lives in `./group.ts`.
 */

import type { Config, StateEntry, StateFile } from "../../core/types.ts";
import { isDirectory } from "../../util/fs.ts";
import { reexpandGroup } from "./group.ts";
import type { InstallNewChild, ReexpandAccumulator, TapReexpandResult } from "./types.ts";

export type {
  InstallNewChild,
  TapReexpandResult,
  TapReexpandRow,
} from "./types.ts";

export function reexpandTaps(
  state: StateFile,
  config: Config,
  home: string,
  restrictNames: readonly string[],
  installOne: InstallNewChild,
): TapReexpandResult {
  const acc: ReexpandAccumulator = {
    added: [],
    updated: [],
    sourceGone: new Set<string>(),
    rows: [],
    hardFailure: false,
  };

  for (const members of groupEntries(state).values()) {
    const first = members[0]!;
    const tap = config.taps.find((t) => t.name === first.source.tap);
    // Tap was removed from config but state still references it.
    // doctor --repair will rebuild it from markers; here we just skip.
    if (!tap) continue;

    // Whole-tap tracking: only groups whose members asked for the
    // whole tap (either by URL or by tap name) get re-expanded. A
    // user who installed an individual skill from the tap doesn't
    // suddenly acquire every sibling on update.
    if (!members.some((m) => m.tracks_tap === true)) continue;

    if (!namedByFilter(members, tap.name, restrictNames)) continue;

    // Project-scoped group whose project_root is gone: skip.
    const projectRoot = first.project_root ?? null;
    if (first.scope === "project" && projectRoot && !isDirectory(projectRoot)) continue;

    reexpandGroup(members, tap, home, projectRoot, acc, installOne);
  }

  return {
    added: acc.added,
    updated: acc.updated,
    hardFailure: acc.hardFailure,
    sourceGone: acc.sourceGone,
    rows: acc.rows,
  };
}

/**
 * Group state entries by (tap-name, scope, project_root, ref). Entries
 * sharing all four are managed together: same tap clone, same install
 * location, same target set (typically), same revision.
 *
 * `ref` is part of the key because it decides which commit gets walked.
 * A group installed at `@v1` and one installed at the default branch see
 * different child sets, and merging them would re-expand one of them
 * against a revision it never asked for (§10.1.1).
 */
function groupEntries(state: StateFile): Map<string, StateEntry[]> {
  const byKey = new Map<string, StateEntry[]>();
  for (const entry of state.installations) {
    const key = [entry.source.tap, entry.scope, entry.project_root ?? "", entry.ref ?? ""].join(
      "::",
    );
    const group = byKey.get(key);
    if (group) group.push(entry);
    else byKey.set(key, [entry]);
  }
  return byKey;
}

/**
 * Re-expand only if the user named a member of this group, or named the
 * tap itself. An empty filter means "every group".
 */
function namedByFilter(
  members: readonly StateEntry[],
  tapName: string,
  restrictNames: readonly string[],
): boolean {
  if (restrictNames.length === 0) return true;
  if (restrictNames.includes(tapName)) return true;
  const memberNames = new Set(members.map((m) => m.name));
  return restrictNames.some((n) => memberNames.has(n));
}
