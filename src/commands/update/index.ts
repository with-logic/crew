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
 * `--dry-run` (§10.1.1): tap clones are still fetched and checked out —
 * that is how crew learns what moved — but nothing else is written:
 * per-skill moves report `would_update`, tap additions report
 * `would_add`, and no installed skill, marker, store entry, or
 * `state.json` changes. A dry run also never takes the state lock,
 * because acquiring it would itself create `state.json` (§14 reserves
 * the lock for commands that write).
 *
 * Clone locking (§14): because a dry run still fetches, it still
 * mutates shared tap clones. Both paths therefore hold a per-tap lock
 * spanning refresh → re-expansion → per-skill source read and staging,
 * so a concurrent run can't check out a different commit in the window
 * between this run resolving a SHA and copying that SHA's bytes.
 *
 * Error isolation: a failure on one skill is recorded against that
 * skill only; processing continues. Exit code follows §10.1:
 *   - 0 if every skill is up-to-date / updated / cleanly-skipped / source_gone.
 *   - 1 if any skill had a hard failure (network, fetch, validation).
 */

import { readConfig } from "../../config/load.ts";
import { crewHome } from "../../core/paths.ts";
import { garbageCollectStore } from "../../maintenance/gc.ts";
import { writeState } from "../../state/load.ts";
import { withStateLock } from "../../state/lock.ts";
import type { CommandContext, CommandOutput } from "../types.ts";
import { planUpdate } from "./plan.ts";
import { renderUpdate } from "./render.ts";

export function updateCommand(ctx: CommandContext): CommandOutput {
  const config = readConfig(ctx.home);
  const home = ctx.home ?? crewHome();
  const dryRun = ctx.flags.dryRun;

  // A dry run reads, fetches tap clones, and reports; it never locks,
  // writes state, or GCs the store.
  const plan = dryRun
    ? planUpdate(ctx, config, home, true)
    : withStateLock(() => {
        const p = planUpdate(ctx, config, home, false);
        writeState(p.state, home);
        return p;
      }, home);

  if (!dryRun) garbageCollectStore(plan.state, home);

  const { rows, tapReexpandRows, tapRows } = plan;
  return {
    exitCode: plan.hardFailure ? 1 : 0,
    human: renderUpdate({ rows, tapReexpandRows, tapRows, dryRun }, ctx.style),
    json: { rows, tap_reexpand_rows: tapReexpandRows, tap_rows: tapRows, dry_run: dryRun },
  };
}
