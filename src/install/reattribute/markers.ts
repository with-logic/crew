/**
 * The markers a re-attribution moves (§5.4, §11.1): finding the ones a
 * move claims, checking before the install that each can follow, and
 * rewriting them onto the incoming tap. Markers are authoritative for
 * `doctor --repair`, so a move isn't done until they follow.
 */

import { accessSync, constants } from "node:fs";
import { join } from "node:path";
import { type AgentAdapter, baseFor } from "../../agents/adapter.ts";
import { ALL_AGENTS } from "../../agents/registry.ts";
import type { Marker, TapConfig } from "../../core/types.ts";
import { tryReadJson, writeJson } from "../../util/json.ts";
import type { Reattribution } from "../duplicate-rules/index.ts";

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
  skip: ReadonlySet<string> = new Set(),
): void {
  if (reattributions.length === 0) return;
  const tapsByName = new Map(taps.map((t) => [t.name, t]));
  for (const m of markersToMove(reattributions, cwd, skip)) rewriteMarker(m, tapsByName);
}

/**
 * The folders `moves`' skills occupy in the `targeted` agents. A reinstall
 * writes or fails each of those itself, and reports it agent by agent, so
 * its move's follow-up — and the check for it — leaves them alone (§5.4).
 */
export function targetedFolders(
  moves: readonly Reattribution[],
  targeted: readonly AgentAdapter[],
  cwd: string,
): ReadonlySet<string> {
  const folders = new Set<string>();
  for (const r of moves) {
    const root = rootOf(r, cwd);
    if (root === null) continue;
    for (const adapter of targeted) {
      const base = baseFor(adapter, r.scope, root);
      if (base !== "") folders.add(join(base, r.name));
    }
  }
  return folders;
}

/**
 * Throw, before any config, marker, or state is written, when a marker a
 * move will rewrite can't be parsed, or sits in a folder crew can't write
 * (`writeJson` renames a new marker into place) (§5.4, §11.1): every
 * marker an up-front move claims, and those a reinstall's move claims
 * outside its `targeted` folders — exactly what each will rewrite.
 */
export function assertMarkersCanMove(
  moves: {
    readonly upFront: readonly Reattribution[];
    readonly onSuccess: readonly Reattribution[];
    readonly targeted: ReadonlySet<string>;
  },
  cwd: string,
): void {
  const markers = [
    ...markersToMove(moves.upFront, cwd),
    ...markersToMove(moves.onSuccess, cwd, moves.targeted),
  ];
  for (const m of markers) accessSync(m.installDir, constants.W_OK);
}

/** A marker a move claims: one still naming the move's old tap. */
interface MarkerToMove {
  readonly installDir: string;
  readonly marker: Marker;
  readonly move: Reattribution;
}

/** The root `baseFor` resolves `move`'s install folders against; null for a project move with no recorded root. */
function rootOf(move: Reattribution, cwd: string): string | null {
  return move.scope === "user" ? cwd : move.projectRoot;
}

/**
 * The markers `moves` claim, once per folder — agents sharing a skills
 * folder (§7.2) share its one marker — never reading a folder in `skip`.
 */
function markersToMove(
  moves: readonly Reattribution[],
  cwd: string,
  skip: ReadonlySet<string> = new Set(),
): MarkerToMove[] {
  const found: MarkerToMove[] = [];
  const seen = new Set<string>(skip);
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
