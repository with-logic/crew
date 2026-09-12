/**
 * Planning for `crew update` (§10.1, §10.1.1).
 *
 * `planUpdate` does everything the command decides — select entries,
 * refresh taps, re-expand them, walk each selected entry — and returns
 * the state that would result plus every output row. It does NOT lock
 * state, persist, or GC; the caller in `./index.ts` owns that, so the
 * preview and the real run share one decision path and can never
 * disagree about what happens.
 *
 * Clone locking (§14) lives here because it spans the whole plan:
 * refresh, re-expansion, and per-skill source reads all touch the same
 * tap working tree, so the locks must be held across all three.
 */

import type { Config, StateFile, TapConfig } from "../../core/types.ts";
import { installNewTapChild } from "../../install/install-new-tap-child.ts";
import { reexpandTaps, type TapReexpandRow } from "../../install/tap-reexpand/index.ts";
import { updateOneEntry } from "../../install/update/entry.ts";
import type { UpdateRow } from "../../install/update/types.ts";
import { withTapLocks } from "../../sources/tap-lock.ts";
import { readState, upsertEntry } from "../../state/load.ts";
import { resolveStateSubjects } from "../../state/subjects.ts";
import { refreshTaps, type TapRefreshRow } from "../tap/refresh.ts";
import type { CommandContext } from "../types.ts";
import { chooseEntries, tapsToRefreshFor, withTransitive } from "./selection.ts";

/** What an update run would do: the resulting state plus every output row. */
export interface UpdatePlan {
  readonly state: StateFile;
  readonly rows: readonly UpdateRow[];
  readonly tapReexpandRows: readonly TapReexpandRow[];
  readonly tapRows: readonly TapRefreshRow[];
  readonly hardFailure: boolean;
}

/**
 * Refresh taps, re-expand them, and walk every selected entry,
 * returning the state that would result. `dryRun` is threaded into the
 * per-skill and per-child steps, so this one function drives both the
 * preview and the real run — they can never disagree about what
 * happens.
 */
export function planUpdate(
  ctx: CommandContext,
  config: Config,
  home: string,
  dryRun: boolean,
): UpdatePlan {
  const rawNames = ctx.positional;
  const current = readState(home);

  // Dep-closure expansion — may add more entries, but they all live in
  // state already (we never install new skills during update).
  const subjects = resolveStateSubjects(current, rawNames);
  const { entries: initialSelected, transitiveSources } = chooseEntries(current, subjects);
  const names = subjects.map((subject) => subject.name);

  // §10.1 step 1 (scoped): only the taps that back the entries this run
  // will actually touch. Their clones are locked for the whole plan —
  // refresh, re-expansion, and every per-skill source read — because
  // all three read or mutate the same working tree.
  const taps = tapsToRefreshFor(config, names, initialSelected);
  return withTapLocks(taps, home, () =>
    planLockedUpdate({
      ctx,
      config,
      home,
      dryRun,
      rawNames,
      taps,
      state: current,
      transitiveSources,
      names,
    }),
  );
}

/** Inputs to the locked half of the plan, after selection has run. */
interface LockedPlanInput {
  readonly ctx: CommandContext;
  readonly config: Config;
  readonly home: string;
  readonly dryRun: boolean;
  readonly rawNames: readonly string[];
  readonly taps: readonly TapConfig[];
  readonly state: StateFile;
  readonly transitiveSources: ReadonlyMap<string, readonly string[]>;
  readonly names: readonly string[];
}

/**
 * The part of the plan that touches tap clones, run with every relevant
 * clone lock held.
 */
function planLockedUpdate(input: LockedPlanInput): UpdatePlan {
  const { ctx, config, home, dryRun, rawNames, taps, transitiveSources, names } = input;
  const rows: UpdateRow[] = [];
  const tapReexpandRows: TapReexpandRow[] = [];
  let hardFailure = false;
  let current = input.state;

  const tapRows = refreshTaps(taps, home);

  // §10.1 step 2b: re-expand taps before walking per-skill updates.
  const reexpanded = reexpandTaps(
    current,
    config,
    home,
    names,
    (args) => installNewTapChild(args, ctx.flags.force, home, ctx.cwd),
    dryRun,
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
  const { entries: targetEntries } = chooseEntries(
    current,
    resolveStateSubjects(current, rawNames),
  );
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
      dryRun,
    );
    current = updatedState;
    rows.push(withTransitive(row, transitiveSources));
    if (bumpHardFailure) hardFailure = true;
  }

  return { state: current, rows, tapReexpandRows, tapRows, hardFailure };
}
