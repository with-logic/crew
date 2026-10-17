/**
 * The markers a re-attribution moves (§5.4, §11.1): finding the ones a
 * move claims and rewriting them onto the incoming tap — up front for an
 * entry the install finds already installed, after it for one it
 * reinstalls. Markers are authoritative for `doctor --repair`, so a move
 * isn't done until they follow. (The check before the install:
 * `./preflight.ts`.)
 */

import { accessSync, constants } from "node:fs";
import { join } from "node:path";
import { type AgentAdapter, baseFor } from "../../agents/adapter.ts";
import { ALL_AGENTS } from "../../agents/registry.ts";
import type { Marker, TapConfig } from "../../core/types.ts";
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
 * reported — follows where crew can read and write its marker, and is left
 * as it is where it can't; returns the old taps such a marker still names,
 * so they aren't collected.
 */
export function followMoves(
  made: readonly Reattribution[],
  records: readonly InstallRecord[],
  agents: readonly AgentAdapter[],
  taps: readonly TapConfig[],
  cwd: string,
): ReadonlySet<string> {
  const targeted = targetedFolders(made, agents, cwd);
  const current = targetedFolders(made, agents, cwd, (move, agent) =>
    records.some(
      (rec) =>
        rec.name === move.name &&
        rec.scope === move.scope &&
        rec.agents.some((a) => a.agent === agent.name && a.kind !== "failed"),
    ),
  );
  const tapsByName = new Map(taps.map((t) => [t.name, t]));
  const stillNamed = new Set<string>();
  for (const m of markersToMove(made, cwd, current, targeted)) {
    if (targeted.has(m.installDir) && !canWrite(m.installDir)) stillNamed.add(m.move.fromTap);
    else rewriteMarker(m, tapsByName);
  }
  return stillNamed;
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
export interface MarkerToMove {
  readonly installDir: string;
  readonly marker: Marker;
  readonly move: Reattribution;
}

/** The root `baseFor` resolves `move`'s install folders against: the project's, or `cwd` at user scope. */
function rootOf(move: Reattribution, cwd: string): string {
  return move.projectRoot ?? cwd;
}

/**
 * The markers `moves` claim, once per folder — agents sharing a skills
 * folder (§7.2) share its one marker — never reading a folder in `skip`.
 * A folder in `tolerate` whose marker can't be read is passed over: its
 * install failed, and was reported.
 */
export function markersToMove(
  moves: readonly Reattribution[],
  cwd: string,
  skip: ReadonlySet<string> = new Set(),
  tolerate: ReadonlySet<string> = new Set(),
): MarkerToMove[] {
  const found: MarkerToMove[] = [];
  const seen = new Set<string>(skip);
  // Go straight to the directories the moves name. Listing every
  // adapter's whole marker tree and filtering afterwards would walk
  // unrelated skills (and unrelated projects) under the state lock; a
  // move knows its own skill name, scope and project root, and the
  // install path is a pure function of those plus the adapter.
  for (const move of moves) {
    for (const adapter of ALL_AGENTS) {
      const base = baseFor(adapter, move.scope, rootOf(move, cwd));
      const installDir = join(base, move.name);
      if (base === "" || seen.has(installDir)) continue;
      const marker = readMarker(installDir, tolerate.has(installDir));
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

/** The marker in `installDir`; a `tolerant` read takes one it can't parse for none. */
function readMarker(installDir: string, tolerant: boolean): Marker | null {
  try {
    return tryReadJson<Marker>(join(installDir, ".crew.json"));
  } catch (err) {
    if (tolerant) return null;
    throw err;
  }
}

/** True when crew can replace a marker in `installDir` (`writeJson` renames into the folder). */
function canWrite(installDir: string): boolean {
  try {
    accessSync(installDir, constants.W_OK);
    return true;
  } catch {
    return false;
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
    tap_name: tap.name,
    tap_kind: tap.kind,
    tap_url: tap.url,
    tap_subpath: tap.subpath,
    tap_path: tap.path,
    ...(tap.discovery === "recursive" ? { tap_discovery: "recursive" } : {}),
    path: m.move.toPath,
  });
}
