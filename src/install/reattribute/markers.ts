/**
 * The markers a re-attribution moves (§5.4, §11.1), rewritten onto the
 * incoming tap: up front for an entry the install finds already installed,
 * after it for one it reinstalls. Markers are authoritative for `doctor
 * --repair`, so a move isn't done until they follow (checked first:
 * `./preflight.ts`).
 */

import { join } from "node:path";
import { type AgentAdapter, baseFor } from "../../agents/adapter.ts";
import {
  asMarkerObject,
  isNotAMarkerError,
  readMarkerAt,
  type UncheckedMarker,
} from "../../agents/marker-read.ts";
import { ALL_AGENTS } from "../../agents/registry.ts";
import { markerTapFields } from "../../core/marker.ts";
import type { TapConfig } from "../../core/types.ts";
import { tryReadJson, writeJson } from "../../util/json.ts";
import type { Reattribution } from "../duplicate-rules/index.ts";
import type { InstallRecord } from "../perform/index.ts";

/**
 * Rewrite every marker `reattributions` claim — each still naming its
 * move's old tap — onto the incoming tap: the whole descriptor (name,
 * kind, url, subpath, path, discovery) plus the skill's location in it, so
 * a marker-only rebuild lands there too. Unlike `rewriteTapMarkers`, this
 * moves one skill at a time: the old tap may still own others.
 */
export function rewriteReattributedMarkers(
  reattributions: readonly Reattribution[],
  taps: readonly TapConfig[],
  cwd: string,
): void {
  const tapsByName = new Map(taps.map((t) => [t.name, t]));
  for (const m of markersToMove(reattributions, cwd)) rewriteMarker(m, tapsByName);
}

/**
 * After an install, move the rest of the markers of the entries its
 * reinstalls moved (§5.4): every one still naming the old tap, except in
 * the folders the install left current (`records` show the agent
 * installed or up to date). A targeted copy whose install failed — and was
 * reported — follows where crew can read and rewrite its marker, and is
 * left as it is where it can't; auto-tap collection reads the markers, so
 * the old tap such a marker names stays (§16.5).
 */
export function followMoves(
  made: readonly Reattribution[],
  records: readonly InstallRecord[],
  agents: readonly AgentAdapter[],
  taps: readonly TapConfig[],
  cwd: string,
): void {
  const current = targetedFolders(made, agents, cwd, (move, agent) =>
    records.some(
      (rec) =>
        rec.name === move.name &&
        rec.scope === move.scope &&
        rec.agents.some(
          (a) => a.agent === agent.name && (a.kind === "installed" || a.kind === "up_to_date"),
        ),
    ),
  );
  const failed = new Set<string>();
  for (const folder of targetedFolders(made, agents, cwd)) {
    if (!current.has(folder)) failed.add(folder);
  }
  const tapsByName = new Map(taps.map((t) => [t.name, t]));
  for (const m of markersToMove(made, cwd, { skip: current, tolerate: failed })) {
    if (failed.has(m.installDir)) tryRewriteMarker(m, tapsByName);
    else rewriteMarker(m, tapsByName);
  }
}

/**
 * The folders `moves`' skills occupy in `agents` — those `keep` accepts.
 * A reinstall writes or fails each of its own, and reports it agent by
 * agent (§5.4).
 */
export function targetedFolders(
  moves: readonly Reattribution[],
  agents: readonly AgentAdapter[],
  cwd: string,
  keep: (move: Reattribution, agent: AgentAdapter) => boolean = () => true,
): ReadonlySet<string> {
  const folders = new Set<string>();
  for (const move of moves) {
    for (const adapter of agents) {
      const base = baseFor(adapter, move.scope, rootOf(move, cwd));
      if (base !== "" && keep(move, adapter)) folders.add(join(base, move.name));
    }
  }
  return folders;
}

/** A marker a move claims: one still naming the move's old tap. */
interface MarkerToMove {
  readonly installDir: string;
  readonly marker: UncheckedMarker;
  readonly move: Reattribution;
}

/** The root `baseFor` resolves `move`'s install folders against: the project's, or `cwd` at user scope. */
function rootOf(move: Reattribution, cwd: string): string {
  return move.projectRoot ?? cwd;
}

/**
 * The markers `moves` claim, once per folder — agents sharing a skills
 * folder (§7.2) share its one marker — never reading a folder in `skip`.
 * A path that can't hold a marker is passed over. In a folder in
 * `tolerate`, so is a marker crew can't read or parse (`readMarkerAt`);
 * elsewhere such a read throws. A marker whose `agents` isn't a list
 * belongs to no agent, so no move claims it.
 */
export function markersToMove(
  moves: readonly Reattribution[],
  cwd: string,
  folders: { readonly skip?: ReadonlySet<string>; readonly tolerate?: ReadonlySet<string> } = {},
): MarkerToMove[] {
  const found: MarkerToMove[] = [];
  const seen = new Set<string>(folders.skip);
  // Go straight to the folders the moves name, a pure function of skill,
  // scope, root, and adapter, rather than walk every adapter's tree.
  for (const move of moves) {
    for (const adapter of ALL_AGENTS) {
      const base = baseFor(adapter, move.scope, rootOf(move, cwd));
      const installDir = join(base, move.name);
      if (base === "" || seen.has(installDir)) continue;
      const marker = folders.tolerate?.has(installDir)
        ? tolerantMarker(installDir)
        : strictMarker(installDir);
      // No marker, one this adapter doesn't own, or one for another
      // skill or tap: not this move's. The old tap may still own other
      // skills, so only markers naming it move.
      const owners = marker?.agents;
      if (!(marker && Array.isArray(owners) && owners.includes(adapter.name))) continue;
      seen.add(installDir);
      if (marker.name === move.name && marker.tap_name === move.fromTap) {
        found.push({ installDir, marker, move });
      }
    }
  }
  return found;
}

/** The marker in `installDir`, or null where there is none or crew can't read it. */
function tolerantMarker(installDir: string): UncheckedMarker | null {
  const read = readMarkerAt(installDir);
  return read.kind === "marker" ? read.marker : null;
}

/** The marker in `installDir`, or null where none can be; any other failure throws. */
function strictMarker(installDir: string): UncheckedMarker | null {
  try {
    return asMarkerObject(tryReadJson<unknown>(join(installDir, ".crew.json")));
  } catch (err) {
    if (isNotAMarkerError(err)) return null;
    throw err;
  }
}

/** Rewrite a failed copy's marker; leave it when crew can't replace it (a locked file, say). */
function tryRewriteMarker(m: MarkerToMove, tapsByName: ReadonlyMap<string, TapConfig>): void {
  try {
    rewriteMarker(m, tapsByName);
  } catch {
    // The copy's failure was reported; collection keeps the tap it names.
  }
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
    ...markerTapFields(tap),
    path: m.move.toPath,
  } satisfies UncheckedMarker);
}
