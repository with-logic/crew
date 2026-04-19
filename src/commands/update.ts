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
 * in state, re-resolve the original reference, install newly-added
 * children, and mark removed children as `source_gone`. This is how
 * `crew install @org/skills` + autoupdate pulls in new team skills.
 *
 * Error isolation: a failure on one skill is recorded against that
 * skill only; processing continues. Exit code follows §10.1:
 *   - 0 if every skill is up-to-date / updated / cleanly-skipped / source_gone.
 *   - 1 if any skill had a hard failure (network, fetch, validation).
 */

import { readConfig } from "../config/load.ts";
import { CrewError } from "../core/errors.ts";
import { crewHome, tapPath } from "../core/paths.ts";
import type { StateEntry, StateFile } from "../core/types.ts";
import { ensureRepo } from "../git/repo.ts";
import { type BundleRow, installNewBundleChild, reexpandBundles } from "../install/bundle/index.ts";
import { type UpdateRow, updateOneEntry } from "../install/update-one.ts";
import { garbageCollectStore } from "../maintenance/gc.ts";
import { readState, upsertEntry, writeState } from "../state/load.ts";
import { withStateLock } from "../state/lock.ts";
import type { CommandContext, CommandOutput } from "./types.ts";

/** Result of refreshing one configured tap at the start of an update run. */
interface TapRow {
  name: string;
  url: string;
  kind: "refreshed" | "failed";
  error?: { code: string; message: string };
}

export function updateCommand(ctx: CommandContext): CommandOutput {
  const config = readConfig(ctx.home);
  const home = ctx.home ?? crewHome();

  const names = ctx.positional;

  const rows: UpdateRow[] = [];
  const bundleRows: BundleRow[] = [];
  const tapRows: TapRow[] = [];
  let hardFailure = false;

  const newState = withStateLock(() => {
    let current = readState(home);

    // §10.1 step 1: fetch every configured tap so local clones reflect
    // upstream. Per-tap failures become warnings, not hard errors — an
    // offline tap doesn't stop updates for the rest. This is what keeps
    // `crew search` in sync with upstream without requiring a reinstall.
    for (const tap of config.taps) {
      try {
        ensureRepo(tap.url, tapPath(tap.name, home));
        tapRows.push({ name: tap.name, url: tap.url, kind: "refreshed" });
      } catch (err) {
        const ce = err as CrewError;
        tapRows.push({
          name: tap.name,
          url: tap.url,
          kind: "failed",
          error: { code: ce.code ?? "source_unreachable", message: ce.message },
        });
      }
    }

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
