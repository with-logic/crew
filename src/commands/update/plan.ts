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

import type { Config, StateEntry, StateFile, TapConfig } from "../../core/types.ts";
import { installNewTapChild } from "../../install/install-new-tap-child.ts";
import { reexpandTaps, type TapReexpandRow } from "../../install/tap-reexpand/index.ts";
import { updateOneEntry } from "../../install/update/entry.ts";
import type { UpdateRow } from "../../install/update/types.ts";
import { withTapLocks } from "../../sources/tap-lock.ts";
import {
  type CollectionKind,
  type CollectionSubject,
  refreshCollectionSubjects,
  resolveCollectionSubjects,
} from "../../state/collections.ts";
import { readState, upsertEntry } from "../../state/load.ts";
import { refreshTaps, type TapRefreshRow } from "../tap/refresh.ts";
import type { CommandContext } from "../types.ts";
import type { CollectionSummary } from "./render.ts";
import {
  chooseEntries,
  reexpandSelectionFor,
  tapsToRefreshFor,
  withTransitive,
} from "./selection.ts";

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

/** Inputs to the locked half of the plan, after selection has run. */
interface LockedPlanInput {
  readonly ctx: CommandContext;
  readonly config: Config;
  readonly home: string;
  readonly dryRun: boolean;
  readonly taps: readonly TapConfig[];
  readonly state: StateFile;
  readonly transitiveSources: ReadonlyMap<string, readonly string[]>;
  /**
   * The resolved positionals. Carried whole rather than flattened to
   * names: a selector's identity is `(tap, scope, project_root, name)`,
   * and re-expansion must not rediscover a same-named entry from some
   * other tap or scope (§10.1).
   */
  readonly subjects: readonly CollectionSubject[];
  /** Entries the subjects expanded to, before re-expansion ran. */
  readonly initialSelected: readonly StateEntry[];
}

/**
 * The part of the plan that touches tap clones, run with every relevant
 * clone lock held.
 */
function planLockedUpdate(input: LockedPlanInput): UpdatePlan {
  const { ctx, config, home, dryRun, taps, transitiveSources, subjects, initialSelected } =
    input;
  const rows: UpdateRow[] = [];
  const tapReexpandRows: TapReexpandRow[] = [];
  let hardFailure = false;
  let current = input.state;
  const selectors: UpdateSelector[] = subjects.map((s) => ({
    raw: s.raw,
    kind: s.kind,
    name: s.name,
  }));
  const collections: CollectionSummary[] = [];
  for (const s of subjects) {
    if (s.kind === "skill") continue;
    collections.push({ kind: s.kind, name: s.name, count: s.entries.length });
  }

  const tapRows = refreshTaps(taps, home);

  // §10.1 step 2b: re-expand taps before walking per-skill updates.
  const reexpanded = reexpandTaps(
    current,
    config,
    home,
    reexpandSelectionFor(subjects, initialSelected),
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
  // Refresh membership against the post-re-expansion state WITHOUT
  // re-resolving the raw strings: re-resolution would let a newly
  // discovered same-named entry in another tap or scope capture a
  // selector that was already bound elsewhere (§10.1).
  const { entries: targetEntries } = chooseEntries(
    current,
    refreshCollectionSubjects(current, subjects),
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

  return {
    state: current,
    rows,
    tapReexpandRows,
    tapRows,
    hardFailure,
    collections,
    selectors,
  };
}
