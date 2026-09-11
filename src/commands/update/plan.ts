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
 * Clone locking (§14) is acquired here because it spans the whole plan:
 * refresh, re-expansion, and per-skill source reads all touch the same
 * tap working tree, so the locks must be held across all three. The
 * work done under them lives in `./locked-plan.ts`.
 */

import type { Config, StateFile } from "../../core/types.ts";
import type { TapReexpandRow } from "../../install/tap-reexpand/index.ts";
import type { UpdateRow } from "../../install/update/types.ts";
import { withTapLocks } from "../../sources/tap-lock.ts";
import { type CollectionKind, resolveCollectionSubjects } from "../../state/collections.ts";
import { readState } from "../../state/load.ts";
import type { TapRefreshRow } from "../tap/refresh.ts";
import type { CommandContext } from "../types.ts";
import { planLockedUpdate } from "./locked-plan.ts";
import type { CollectionSummary } from "./render.ts";
import { chooseEntries, tapsToRefreshFor } from "./selection.ts";

/** One resolved positional, echoed in `--json` so callers see how it was read. */
export interface UpdateSelector {
  readonly raw: string;
  readonly kind: CollectionKind;
  readonly name: string;
}

/** What an update run would do: the resulting state plus every output row. */
export interface UpdatePlan {
  readonly state: StateFile;
  readonly rows: readonly UpdateRow[];
  readonly tapReexpandRows: readonly TapReexpandRow[];
  readonly tapRows: readonly TapRefreshRow[];
  readonly hardFailure: boolean;
  /** Collection selectors that expanded, for the human header. */
  readonly collections: readonly CollectionSummary[];
  /** Every resolved positional, echoed in `--json`. */
  readonly selectors: readonly UpdateSelector[];
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
  const subjects = resolveCollectionSubjects(current, config, rawNames);
  const { entries: initialSelected, transitiveSources } = chooseEntries(current, subjects);

  // §10.1 step 1 (scoped): only the taps that back the entries this run
  // will actually touch. Their clones are locked for the whole plan —
  // refresh, re-expansion, and every per-skill source read — because
  // all three read or mutate the same working tree.
  const taps = tapsToRefreshFor(config, subjects, initialSelected);
  return withTapLocks(taps, home, () =>
    planLockedUpdate({
      ctx,
      config,
      home,
      dryRun,
      taps,
      state: current,
      transitiveSources,
      subjects,
      initialSelected,
    }),
  );
}
