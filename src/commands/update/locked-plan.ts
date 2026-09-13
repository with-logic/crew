/**
 * The part of `crew update`'s plan that touches tap clones (§10.1,
 * §10.1.1), run with every relevant clone lock held.
 *
 * Split from `./plan.ts` (200-line cap). `./plan.ts` owns selection and
 * lock acquisition; this file owns everything that happens inside the
 * locks: refresh, re-expansion, and the per-entry update walk.
 */

import type { Config, StateEntry, StateFile, TapConfig } from "../../core/types.ts";
import { installNewTapChild } from "../../install/install-new-tap-child.ts";
import { reexpandTaps, type TapReexpandRow } from "../../install/tap-reexpand/index.ts";
import { updateOneEntry } from "../../install/update/entry.ts";
import type { UpdateRow } from "../../install/update/types.ts";
import {
  type CollectionSubject,
  entryIdentity,
  refreshCollectionSubjects,
} from "../../state/collections.ts";
import { upsertEntry } from "../../state/load.ts";
import { refreshTaps } from "../tap/refresh.ts";
import type { CommandContext } from "../types.ts";
import type { UpdatePlan, UpdateSelector } from "./plan.ts";
import type { CollectionSummary } from "./render.ts";
import { chooseEntries, reexpandSelectionFor, withTransitive } from "./selection.ts";

/** Inputs to the locked half of the plan, after selection has run. */
export interface LockedPlanInput {
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

export function planLockedUpdate(input: LockedPlanInput): UpdatePlan {
  const { ctx, config, home, dryRun, taps, transitiveSources, subjects, initialSelected } = input;
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
  // A tap the user named AS A SELECTOR that could not be refreshed is a
  // hard failure, even when nothing is installed from it: the run did
  // not do what was asked, and exiting 0 lets the warning scroll past
  // unnoticed. An unnamed tap that merely happens to be configured
  // stays a warning, per the per-tap isolation rule in §10.1.
  const namedTaps = new Set<string>();
  for (const s of subjects) {
    if (s.kind === "tap") namedTaps.add(s.name);
  }
  for (const row of tapRows) {
    if (row.kind === "failed" && namedTaps.has(row.name)) hardFailure = true;
  }

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

  // Refresh membership against the post-re-expansion state WITHOUT
  // re-resolving the raw strings: re-resolution would let a newly
  // discovered same-named entry in another tap or scope capture a
  // selector that was already bound elsewhere (§10.1).
  const { entries: targetEntries } = chooseEntries(
    current,
    refreshCollectionSubjects(current, subjects),
  );
  for (const entry of targetEntries) {
    if (sourceGone.has(entryIdentity(entry))) {
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
