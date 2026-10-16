/**
 * Re-attribute state entries onto the incoming tap (§5.4, §16.5).
 *
 * When a skill is already installed from an auto tap and the user
 * installs the same location again through a tap that covers it — the
 * whole repo, say, instead of one subpath — the bytes don't move but
 * the bookkeeping does. The entry's `source` is rewritten to the
 * incoming tap, and the install-site markers follow, since markers are
 * authoritative for `doctor --repair` (§11.1).
 */

import { accessSync, constants } from "node:fs";
import { join } from "node:path";
import { type AgentAdapter, baseFor } from "../agents/adapter.ts";
import { ALL_AGENTS } from "../agents/registry.ts";
import type { Marker, StateFile, TapConfig } from "../core/types.ts";
import { entryKey, installLocationKey } from "../state/identity.ts";
import { tryReadJson, writeJson } from "../util/json.ts";
import type { Reattribution } from "./duplicate-rules/index.ts";

function movesByLocation(
  reattributions: readonly Reattribution[],
): ReadonlyMap<string, Reattribution> {
  const byLocation = new Map<string, Reattribution>();
  for (const r of reattributions) {
    byLocation.set(installLocationKey(r.name, r.scope, r.projectRoot), r);
  }
  return byLocation;
}

/**
 * The moves an install's reinstalls made: those whose entry `state` now
 * attributes to the incoming tap (§5.4). A reinstall that failed on every
 * agent left its entry where it was.
 */
export function movesMade(moves: readonly Reattribution[], state: StateFile): Reattribution[] {
  if (moves.length === 0) return [];
  const byLocation = movesByLocation(moves);
  const made: Reattribution[] = [];
  for (const entry of state.installations) {
    const move = byLocation.get(entryKey(entry));
    if (move !== undefined && entry.source.tap === move.toTap) made.push(move);
  }
  return made;
}

/** Apply the moves of entries an install finds already installed to `state`. */
export function applyReattributions(
  state: StateFile,
  reattributions: readonly Reattribution[],
): StateFile {
  if (reattributions.length === 0) return state;
  const moves = movesByLocation(reattributions);
  return {
    schema_version: 1,
    installations: state.installations.map((entry) => {
      const move = moves.get(entryKey(entry));
      if (!move) return entry;
      // An already-installed entry skips `performInstall`, so it takes a
      // subscription with the move (§10.1.1). `./duplicate-rules/classify.ts`
      // moves a tracking entry only when the move carries its subscription,
      // so keeping the entry's own `tracks_tap` never subscribes it anywhere new.
      return {
        ...entry,
        source: { tap: move.toTap, path: move.toPath },
        ...(move.tracksTap ? { tracks_tap: true } : {}),
      };
    }),
  };
}

/**
 * Rewrite the tap descriptor of every marker belonging to a
 * re-attributed skill. Unlike `rewriteTapMarkers`, which moves every
 * marker of a renamed tap, this targets one skill at a time — the old
 * tap may still own other skills that are staying put. The whole
 * descriptor moves (name, kind, url, subpath, path, discovery) plus the
 * skill's location inside the new tap, so a marker-only rebuild lands on
 * the incoming tap too.
 */
export function rewriteReattributedMarkers(
  reattributions: readonly Reattribution[],
  taps: readonly TapConfig[],
  cwd: string,
): void {
  if (reattributions.length === 0) return;
  const tapsByName = new Map(taps.map((t) => [t.name, t]));
  for (const m of markersToMove(reattributions, cwd)) rewriteMarker(m, tapsByName);
}

/**
 * Throw, before any config, marker, or state is written, when a marker a
 * move will rewrite can't be read, or sits in a folder crew can't write
 * (`writeJson` renames a new marker into place) (§5.4, §11.1). `upFront`
 * moves rewrite every marker still naming their old tap before the
 * install; a reinstall's move rewrites, after it, those in agents the
 * run doesn't target — the targeted ones are the install's to write, and
 * to report agent by agent.
 */
export function assertMarkersCanMove(
  upFront: readonly Reattribution[],
  onSuccess: readonly Reattribution[],
  targeted: readonly AgentAdapter[],
  cwd: string,
): void {
  const reinstalled = new Set<string>();
  for (const r of onSuccess) {
    const root = rootOf(r, cwd);
    for (const adapter of targeted) {
      const base = root === null ? "" : baseFor(adapter, r.scope, root);
      if (base !== "") reinstalled.add(join(base, r.name));
    }
  }
  const markers = [...markersToMove(upFront, cwd), ...markersToMove(onSuccess, cwd)];
  for (const m of markers) {
    if (!reinstalled.has(m.installDir)) accessSync(m.installDir, constants.W_OK);
  }
}

/** A marker a move claims: one still naming the move's old tap. */
interface MarkerToMove {
  readonly installDir: string;
  readonly marker: Marker;
  readonly move: Reattribution;
}

/** Where `move`'s skill is installed from; null for a project move with no recorded root. */
function rootOf(move: Reattribution, cwd: string): string | null {
  return move.scope === "user" ? cwd : move.projectRoot;
}

/**
 * The markers `moves` claim, once per folder: agents sharing a skills
 * folder (§7.2) share its one marker.
 */
function markersToMove(moves: readonly Reattribution[], cwd: string): MarkerToMove[] {
  const found: MarkerToMove[] = [];
  const seen = new Set<string>();
  // Go straight to the directories the moves name. Listing every
  // adapter's whole marker tree and filtering afterwards would walk
  // unrelated skills (and unrelated projects) under the state lock; a
  // move knows its own skill name, scope and project root, and the
  // install path is a pure function of those plus the adapter.
  for (const move of moves) {
    // A project-scope move with no recorded root has nothing to rewrite:
    // the marker's location is exactly what we'd be guessing at.
    const root = rootOf(move, cwd);
    if (root === null) continue;
    for (const adapter of ALL_AGENTS) {
      const base = baseFor(adapter, move.scope, root);
      const installDir = join(base, move.name);
      if (base === "" || seen.has(installDir)) continue;
      const marker = tryReadJson<Marker>(join(installDir, ".crew.json"));
      // No marker, one this adapter doesn't own, or one for another
      // skill or tap: not this move's. The old tap may still own other
      // skills, so only markers naming it move.
      if (!marker?.agents?.includes(adapter.name)) continue;
      seen.add(installDir);
      if (marker.name === move.name && marker.tap_name === move.fromTap) {
        found.push({ installDir, marker, move });
      }
    }
  }
  return found;
}

function rewriteMarker(m: MarkerToMove, tapsByName: ReadonlyMap<string, TapConfig>): void {
  const tap = tapsByName.get(m.move.toTap);
  if (!tap) return;
  // `tap_discovery` describes the DESTINATION tap, so it can't be
  // inherited from the old marker: a move onto a non-recursive tap that
  // kept the old flag would mislead `doctor --repair`.
  const { tap_discovery: _dropped, ...rest } = m.marker;
  writeJson(join(m.installDir, ".crew.json"), {
    ...rest,
    tap_name: tap.name,
    tap_kind: tap.kind,
    tap_url: tap.url,
    tap_subpath: tap.subpath,
    tap_path: tap.path,
    ...(tap.discovery === "recursive" ? { tap_discovery: "recursive" } : {}),
    path: m.move.toPath,
  });
}
