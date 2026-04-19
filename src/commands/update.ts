/**
 * `crew update [<name>...]` (§10.1).
 *
 * For each installed skill (or the named subset), re-resolve the ref to
 * a SHA. If the SHA hasn't moved, report up-to-date. If it has and the
 * ref is not pinned (or `--force`), re-stage into the store and re-run
 * the install algorithm against every currently-installed (target,
 * scope) pair.
 *
 * Bundle re-expansion (§10.1.1) runs first: for every distinct bundle
 * in state (filtered by `names` if given), re-resolve the original
 * reference, install newly-added children, and mark removed children
 * as `source_gone`. This is how `crew install @org/skills` + autoupdate
 * pulls in new team skills.
 *
 * Fetch scope (§16.4): `crew update` with no args refreshes every
 * configured tap. `crew update <name>...` refreshes only the taps
 * that back the named (or bundle-member) entries — other taps are
 * left untouched, keeping a targeted update fast.
 *
 * Error isolation: a failure on one skill is recorded against that
 * skill only; processing continues. Exit code follows §10.1:
 *   - 0 if every skill is up-to-date / updated / cleanly-skipped / source_gone.
 *   - 1 if any skill had a hard failure (network, fetch, validation).
 */

import { readConfig } from "../config/load.ts";
import { CrewError } from "../core/errors.ts";
import { crewHome } from "../core/paths.ts";
import type { Config, StateEntry, StateFile, TapConfig } from "../core/types.ts";
import { type BundleRow, installNewBundleChild, reexpandBundles } from "../install/bundle/index.ts";
import { type UpdateRow, updateOneEntry } from "../install/update-one.ts";
import { garbageCollectStore } from "../maintenance/gc.ts";
import { readState, upsertEntry, writeState } from "../state/load.ts";
import { withStateLock } from "../state/lock.ts";
import { refreshTaps, type TapRefreshRow } from "./tap/refresh.ts";
import type { CommandContext, CommandOutput } from "./types.ts";

export function updateCommand(ctx: CommandContext): CommandOutput {
  const config = readConfig(ctx.home);
  const home = ctx.home ?? crewHome();

  const names = ctx.positional;

  const rows: UpdateRow[] = [];
  const bundleRows: BundleRow[] = [];
  let tapRows: readonly TapRefreshRow[] = [];
  let hardFailure = false;

  const newState = withStateLock(() => {
    let current = readState(home);

    // §10.1 step 1 (scoped): fetch only the taps that back the entries
    // this run will actually touch. `crew update` with no args refreshes
    // every configured tap; `crew update <name>...` restricts the
    // fetch set to the taps that host those entries (and any bundles
    // being re-expanded because one of their members was named). Per-tap
    // failures become warnings, not hard errors — an offline tap
    // doesn't stop updates for the rest.
    const tapsToRefresh = tapsToRefreshFor(current, config, names);
    tapRows = refreshTaps(tapsToRefresh, home);

    // §10.1 step 2b: re-expand bundles before walking per-skill updates.
    const reexpanded = reexpandBundles(current, config, home, names, (args) =>
      installNewBundleChild(args, ctx.flags.force, home, ctx.cwd),
    );
    bundleRows.push(...reexpanded.rows);
    for (const entry of reexpanded.added) {
      current = upsertEntry(current, entry);
    }
    const sourceGone = reexpanded.sourceGone;

    const targetEntries = chooseEntries(current, names);
    for (const entry of targetEntries) {
      if (sourceGone.has(entry.name)) {
        rows.push({ name: entry.name, scope: entry.scope, outcome: { kind: "source_gone" } });
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
      rows.push(row);
      if (bumpHardFailure) hardFailure = true;
    }
    writeState(current, home);
    return current;
  }, home);

  // Post-state garbage collection.
  garbageCollectStore(newState, home);

  const human = rows.map(formatRow);
  for (const br of bundleRows) {
    if (br.kind === "added") human.unshift(`${br.name} [${br.scope}]: added (bundle re-expansion)`);
    else if (br.kind === "bundle_error")
      human.unshift(`${br.name} [${br.scope}]: bundle error (${br.error?.code ?? "unknown"})`);
    // `source_gone` bundle rows are reflected in the per-entry row loop.
  }
  // Tap fetch warnings go at the very top so users see them before the
  // per-skill rows. A refreshed tap is a silent success — we only
  // surface failures to keep the normal-case output tight.
  for (const tr of tapRows) {
    if (tr.kind === "failed") {
      human.unshift(
        `warning: couldn't refresh tap \`${tr.name}\` (${tr.error?.code ?? "unknown"}) — using the last-fetched clone`,
      );
    }
  }

  return {
    exitCode: hardFailure ? 1 : 0,
    human,
    json: { rows, bundle_rows: bundleRows, tap_rows: tapRows },
  };
}

/**
 * Compute the set of tap configs whose clones this run needs fresh.
 *
 * Empty `names`: every configured tap (full refresh — matches
 * `crew update` with no args).
 *
 * Non-empty `names`: only the taps that host an entry we're going to
 * touch — either directly selected by the name filter, or pulled in
 * because its bundle is being re-expanded (same name-filter rule
 * `reexpandBundles` uses). Other taps are left untouched.
 */
function tapsToRefreshFor(state: StateFile, config: Config, names: readonly string[]): TapConfig[] {
  if (names.length === 0) return [...config.taps];
  const wantedTapNames = new Set<string>();
  const nameSet = new Set(names);
  for (const entry of state.installations) {
    const inNameSet = nameSet.has(entry.name);
    const inTargetedBundle =
      entry.bundle !== undefined &&
      (nameSet.has(entry.bundle.ref) ||
        state.installations.some(
          (e) => e.bundle?.ref === entry.bundle?.ref && nameSet.has(e.name),
        ));
    if (!(inNameSet || inTargetedBundle)) continue;
    if (entry.source.type === "tap") wantedTapNames.add(entry.source.tap);
  }
  return config.taps.filter((t) => wantedTapNames.has(t.name));
}

function formatRow(r: UpdateRow): string {
  if (r.outcome.kind === "up_to_date") return `${r.name} [${r.scope}]: up-to-date`;
  if (r.outcome.kind === "updated")
    return `${r.name} [${r.scope}]: updated → ${r.outcome.new_sha.slice(0, 8)}`;
  if (r.outcome.kind === "skipped") return `${r.name} [${r.scope}]: skipped (${r.outcome.reason})`;
  if (r.outcome.kind === "source_gone")
    return `${r.name} [${r.scope}]: source_gone (local install preserved)`;
  if (r.outcome.kind === "missing_project_root")
    return `${r.name} [${r.scope}]: skipped — project directory \`${r.outcome.root}\` no longer exists`;
  return `${r.name} [${r.scope}]: FAILED ${r.outcome.error.code}`;
}

function chooseEntries(state: StateFile, names: readonly string[]): StateEntry[] {
  if (names.length === 0) return [...state.installations];
  const selected: StateEntry[] = [];
  for (const name of names) {
    const matches = state.installations.filter((e) => e.name === name);
    if (matches.length === 0)
      throw new CrewError(
        "unknown_skill",
        `\`${name}\` isn't installed — run \`crew list\` to see what crew is tracking`,
        { name },
      );
    selected.push(...matches);
  }
  return selected;
}
