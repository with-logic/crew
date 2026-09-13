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

import { join } from "node:path";
import { baseFor } from "../agents/adapter.ts";
import { ALL_AGENTS } from "../agents/registry.ts";
import type { Marker, Scope, StateFile, TapConfig } from "../core/types.ts";
import { tryReadJson, writeJson } from "../util/json.ts";
import type { Reattribution } from "./duplicate-rules/index.ts";

/**
 * Key one move by the install location it targets. Bulk re-attribution
 * runs under the state lock, so both callers index once rather than
 * scanning the move list per entry and per marker.
 */
function moveKey(name: string, scope: Scope, projectRoot: string | null): string {
  return JSON.stringify([name, scope, projectRoot ?? ""]);
}

/** Marker key: a move only claims markers still naming its old tap. */
function markerMoveKey(
  name: string,
  scope: Scope,
  projectRoot: string | null,
  fromTap: string,
): string {
  return JSON.stringify([name, scope, projectRoot ?? "", fromTap]);
}

function movesByLocation(
  reattributions: readonly Reattribution[],
): ReadonlyMap<string, Reattribution> {
  const byLocation = new Map<string, Reattribution>();
  for (const r of reattributions) {
    byLocation.set(moveKey(r.name, r.scope, r.projectRoot), r);
  }
  return byLocation;
}

/** Apply every re-attribution to `state`, returning the updated file. */
export function applyReattributions(
  state: StateFile,
  reattributions: readonly Reattribution[],
): StateFile {
  if (reattributions.length === 0) return state;
  const moves = movesByLocation(reattributions);
  return {
    schema_version: 1,
    installations: state.installations.map((entry) => {
      const move = moves.get(moveKey(entry.name, entry.scope, entry.project_root ?? null));
      if (!move) return entry;
      // The subscription moves with the attribution. A re-attributed
      // entry never reaches `performInstall`, so this is the only place
      // a whole-tap install can record `tracks_tap` for it — without
      // this, asking for the whole repo after installing one child
      // would leave the entry subscribed to nothing and `crew update`
      // would skip siblings added upstream (§10.1.1). One-way, like
      // `explicit`: a narrower install never clears it.
      const tracksTap = move.tracksTap || (entry.tracks_tap ?? false);
      return {
        ...entry,
        source: { tap: move.toTap, path: move.toPath },
        ...(tracksTap ? { tracks_tap: true } : {}),
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
  // Markers additionally match on the tap they came FROM: the old tap
  // may still own other skills, so only markers naming it move.
  const movesByMarker = new Map<string, Reattribution>();
  for (const r of reattributions) {
    movesByMarker.set(markerMoveKey(r.name, r.scope, r.projectRoot, r.fromTap), r);
  }
  // Go straight to the directories the moves name. Listing every
  // adapter's whole marker tree and filtering afterwards would walk
  // unrelated skills (and unrelated projects) under the state lock; a
  // move knows its own skill name, scope and project root, and the
  // install path is a pure function of those plus the adapter.
  for (const r of reattributions) {
    const root = r.scope === "user" ? cwd : r.projectRoot;
    // A project-scope move with no recorded root has nothing to rewrite:
    // the marker's location is exactly what we'd be guessing at.
    if (root === null) continue;
    for (const adapter of ALL_AGENTS) {
      const base = baseFor(adapter, r.scope, root);
      if (base === "") continue;
      const installDir = join(base, r.name);
      const marker = tryReadJson<Marker>(join(installDir, ".crew.json"));
      // No marker, or one this adapter doesn't own: not ours to rewrite.
      if (!marker?.agents?.includes(adapter.name)) continue;
      maybeRewrite(
        installDir,
        marker,
        movesByMarker,
        tapsByName,
        r.scope,
        r.scope === "project" ? root : null,
      );
    }
  }
}

function maybeRewrite(
  installDir: string,
  marker: Marker,
  movesByMarker: ReadonlyMap<string, Reattribution>,
  tapsByName: ReadonlyMap<string, TapConfig>,
  scope: "user" | "project",
  projectRoot: string | null,
): void {
  const move = movesByMarker.get(markerMoveKey(marker.name, scope, projectRoot, marker.tap_name));
  if (!move) return;
  const tap = tapsByName.get(move.toTap);
  if (!tap) return;
  // `tap_discovery` describes the DESTINATION tap, so it can't be
  // inherited from the old marker: a move onto a non-recursive tap that
  // kept the old flag would mislead `doctor --repair`.
  const { tap_discovery: _dropped, ...rest } = marker;
  writeJson(join(installDir, ".crew.json"), {
    ...rest,
    tap_name: tap.name,
    tap_kind: tap.kind,
    tap_url: tap.url,
    tap_subpath: tap.subpath,
    tap_path: tap.path,
    ...(tap.discovery === "recursive" ? { tap_discovery: "recursive" } : {}),
    path: move.toPath,
  });
}
