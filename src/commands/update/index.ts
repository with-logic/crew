/**
 * `crew update [<name>...]` (§10.1).
 *
 * For each installed skill (or the named subset + its transitive
 * dependency closure), re-resolve the ref to a SHA. If the SHA hasn't
 * moved, report up-to-date. If it has and the ref is not pinned (or
 * `--force`), re-stage into the store and re-run the install algorithm
 * against every currently-installed (target, scope) pair.
 *
 * Tap re-expansion (§10.1.1) runs first: for every distinct tap that
 * backs any state entry (filtered by `names` if given), re-walk the
 * tap and install newly-added skills, mark removed skills as
 * `source_gone`. This is how `crew install @org/skills` + autoupdate
 * pulls in new team skills.
 *
 * Dependency closure (§10.1 step 2): `crew update <name>...` expands
 * the update set to include every entry transitively required by a
 * named entry, discovered via `required_by` in state. A skill's new
 * version may declare a newer version of a dep; silently leaving the
 * old dep behind would be a correctness bug. Entries pulled in this
 * way are marked `transitively_required_by: [<top-level name>...]`
 * in the rows so humans and scripts can tell them apart.
 *
 * Fetch scope (§16.4): `crew update` with no args refreshes every
 * configured tap. `crew update <name>...` refreshes only the taps
 * that back the named entries (after dep-closure expansion) — other
 * taps are left untouched.
 *
 * Error isolation: a failure on one skill is recorded against that
 * skill only; processing continues. Exit code follows §10.1:
 *   - 0 if every skill is up-to-date / updated / cleanly-skipped / source_gone.
 *   - 1 if any skill had a hard failure (network, fetch, validation).
 */

import { readConfig } from "../../config/load.ts";
import { CrewError } from "../../core/errors.ts";
import { crewHome } from "../../core/paths.ts";
import type { Config, StateEntry, StateFile, TapConfig } from "../../core/types.ts";
import { installNewTapChild } from "../../install/install-new-tap-child.ts";
import { reexpandTaps, type TapReexpandRow } from "../../install/tap-reexpand.ts";
import { type UpdateRow, updateOneEntry } from "../../install/update-one.ts";
import { garbageCollectStore } from "../../maintenance/gc.ts";
import { readState, upsertEntry, writeState } from "../../state/load.ts";
import { withStateLock } from "../../state/lock.ts";
import { nowIso } from "../../util/time.ts";
import { refreshTaps, type TapRefreshRow } from "../tap/refresh.ts";
import type { CommandContext, CommandOutput } from "../types.ts";
import { renderUpdate } from "./render.ts";

export function updateCommand(ctx: CommandContext): CommandOutput {
  const config = readConfig(ctx.home);
  const home = ctx.home ?? crewHome();

  const names = ctx.positional;

  const rows: UpdateRow[] = [];
  const tapReexpandRows: TapReexpandRow[] = [];
  let tapRows: readonly TapRefreshRow[] = [];
  let hardFailure = false;

  const newState = withStateLock(() => {
    let current = readState(home);

    // Dep-closure expansion — may add more entries, but they all live in
    // state already (we never install new skills during update).
    const { entries: initialSelected, transitiveSources } = chooseEntries(current, names);

    // §10.1 step 1 (scoped): fetch only the taps that back the entries
    // this run will actually touch. Per-tap failures become warnings,
    // not hard errors.
    const tapsToRefresh = tapsToRefreshFor(current, config, names, initialSelected);
    tapRows = refreshTaps(tapsToRefresh, home);

    // §10.1 step 2b: re-expand taps before walking per-skill updates.
    const reexpanded = reexpandTaps(current, config, home, names, (args) =>
      installNewTapChild(args, ctx.flags.force, home, ctx.cwd),
    );
    tapReexpandRows.push(...reexpanded.rows);
    for (const entry of reexpanded.added) {
      current = upsertEntry(current, entry);
    }
    const sourceGone = reexpanded.sourceGone;

    // Re-read the (possibly expanded) target set against the post-
    // tap-re-expansion state. In practice the set is stable — tap
    // re-expansion can add skills, but those come in as explicit
    // top-level entries and aren't part of the dep closure.
    const { entries: targetEntries } = chooseEntries(current, names);
    for (const entry of targetEntries) {
      if (sourceGone.has(entry.name)) {
        rows.push(
          withTransitive(
            { name: entry.name, scope: entry.scope, outcome: { kind: "source_gone" } },
            transitiveSources,
          ),
        );
        continue;
      }
      const { row, updatedState, bumpHardFailure } = updateOneEntry(
        entry,
        current,
        config,
        home,
        ctx.flags.force,
        ctx.cwd,
      );
      current = updatedState;
      rows.push(withTransitive(row, transitiveSources));
      if (bumpHardFailure) hardFailure = true;
    }
    writeState(current, home);
    return current;
  }, home);

  // Post-state garbage collection.
  garbageCollectStore(newState, home);

  const exitCode = hardFailure ? 1 : 0;
  const human = renderUpdate({ rows, tapReexpandRows, tapRows }, ctx.style);
  const stderr =
    process.env["CREW_AUTOUPDATE_LOG"] === "1"
      ? [`crew-autoupdate ${nowIso()} exit=${exitCode}`]
      : [];

  return {
    exitCode,
    human,
    stderr,
    json: { rows, tap_reexpand_rows: tapReexpandRows, tap_rows: tapRows },
  };
}

/**
 * Compute the set of tap configs whose clones this run needs fresh.
 *
 * Empty `names`: every configured tap (full refresh — matches
 * `crew update` with no args).
 *
 * Non-empty `names`: the taps backing every entry in the expanded
 * update set (direct names + dep closure), plus the tap itself if the
 * user named it directly (`crew update <tap-name>`). Other taps
 * untouched.
 */
function tapsToRefreshFor(
  state: StateFile,
  config: Config,
  names: readonly string[],
  expandedSelection: readonly StateEntry[],
): TapConfig[] {
  void state;
  if (names.length === 0) return [...config.taps];
  const wantedTapNames = new Set<string>();
  for (const e of expandedSelection) {
    wantedTapNames.add(e.source.tap);
  }
  // If a positional names a configured tap directly, refresh it (the
  // user wants `crew update <tap-name>` to also pull tap additions).
  for (const n of names) {
    if (config.taps.some((t) => t.name === n)) wantedTapNames.add(n);
  }
  return config.taps.filter((t) => wantedTapNames.has(t.name));
}

/** Attach `transitively_required_by` to a row when the entry's name is in the closure map. */
function withTransitive(
  row: UpdateRow,
  transitiveSources: ReadonlyMap<string, readonly string[]>,
): UpdateRow {
  const parents = transitiveSources.get(row.name);
  if (!parents || parents.length === 0) return row;
  return { ...row, transitively_required_by: parents };
}

/** Expanded update set + per-entry "who pulled you in" map. */
interface ChosenEntries {
  readonly entries: readonly StateEntry[];
  /**
   * For every entry added only via dep closure, the list of top-level
   * names that transitively required it. A name in this map is never
   * one of the command-line positionals.
   */
  readonly transitiveSources: ReadonlyMap<string, readonly string[]>;
}

/**
 * Select entries for the update run, expanding named entries with their
 * transitive dependency closure.
 *
 * Deps are derived from state alone: a skill `bar` is a dependency of
 * `foo` iff `bar.required_by` contains `"foo"` (§11.1). This works
 * without reading SKILL.md from disk.
 */
function chooseEntries(state: StateFile, names: readonly string[]): ChosenEntries {
  if (names.length === 0) {
    return { entries: [...state.installations], transitiveSources: new Map() };
  }
  // Validate every top-level name maps to at least one state entry.
  for (const name of names) {
    if (!state.installations.some((e) => e.name === name)) {
      throw new CrewError(
        "unknown_skill",
        `\`${name}\` isn't installed — run \`crew list\` to see what crew is tracking`,
        { name },
      );
    }
  }

  // Walk `required_by` backward: given a name, its direct deps are the
  // entries that have that name in their `required_by` list. Track which
  // top-level ancestor(s) pulled each transitive name in so we can tag
  // rows with `transitively_required_by` later.
  const topLevel = new Set(names);
  const selectedNames = new Set<string>(); // names visited by the BFS
  const ancestors = new Map<string, Set<string>>(); // transitive name → top-level ancestors
  // BFS queue: pair each name with the top-level ancestor that reached it.
  const queue: { name: string; rootedAt: string }[] = [];
  for (const name of names) queue.push({ name, rootedAt: name });

  while (queue.length > 0) {
    const { name, rootedAt } = queue.shift()!;
    const firstVisit = !selectedNames.has(name);
    selectedNames.add(name);
    // Record ancestry for non-top-level nodes; idempotent when the
    // ancestor is already known, so re-queueing the same node with the
    // same rootedAt is a no-op.
    if (!topLevel.has(name)) {
      if (!ancestors.has(name)) ancestors.set(name, new Set());
      ancestors.get(name)!.add(rootedAt);
    }
    // Only walk children on the first visit — deps don't change as the
    // rootedAt changes, so re-walking would be pure duplicate work.
    if (!firstVisit) continue;
    for (const candidate of state.installations) {
      if (candidate.required_by.includes(name)) {
        queue.push({ name: candidate.name, rootedAt });
      }
    }
  }

  // Emit entries in a stable, human-friendly order:
  //   1. Top-level names in the order the user passed them, across scopes.
  //   2. Transitive entries in state order.
  const entries: StateEntry[] = [];
  const seen = new Set<string>();
  const entryKey = (e: StateEntry) => `${e.name}::${e.scope}::${e.project_root ?? ""}`;
  for (const n of names) {
    for (const e of state.installations) {
      if (e.name !== n) continue;
      const key = entryKey(e);
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(e);
    }
  }
  for (const e of state.installations) {
    if (!selectedNames.has(e.name) || topLevel.has(e.name)) continue;
    const key = entryKey(e);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(e);
  }

  const transitiveSources = new Map<string, readonly string[]>();
  for (const [name, set] of ancestors) {
    transitiveSources.set(name, [...set].sort());
  }
  return { entries, transitiveSources };
}
