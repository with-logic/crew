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
import { crewHome } from "../../core/paths.ts";
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
import { chooseEntries, tapsToRefreshFor, withTransitive } from "./selection.ts";

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
    const tapsToRefresh = tapsToRefreshFor(config, names, initialSelected);
    tapRows = refreshTaps(tapsToRefresh, home);

    // §10.1 step 2b: re-expand taps before walking per-skill updates.
    const reexpanded = reexpandTaps(current, config, home, names, (args) =>
      installNewTapChild(args, ctx.flags.force, home, ctx.cwd),
    );
    tapReexpandRows.push(...reexpanded.rows);
    if (reexpanded.hardFailure) hardFailure = true;
    for (const entry of reexpanded.updated) {
      current = upsertEntry(current, entry);
    }
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
            {
              name: entry.name,
              scope: entry.scope,
              ...(entry.project_root === undefined ? {} : { project_root: entry.project_root }),
              outcome: { kind: "source_gone" },
            },
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
