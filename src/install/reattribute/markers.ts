/**
 * The markers a re-attribution moves (§5.4, §11.1), rewritten onto the
 * incoming tap: up front for an entry the install finds already installed,
 * after it for one it reinstalls. Markers are authoritative for `doctor
 * --repair`, so a move isn't done until they follow (checked first:
 * `./preflight.ts`).
 */

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
 * reported — follows where crew can rewrite its marker; one it can't read
 * or rewrite is left as it is, and its old tap returned so this install
 * doesn't collect it. One crew can't parse names nothing, and is left.
 */
export function followMoves(
  made: readonly Reattribution[],
  records: readonly InstallRecord[],
  agents: readonly AgentAdapter[],
  taps: readonly TapConfig[],
  cwd: string,
): ReadonlySet<string> {
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
  const stillNamed = new Set<string>();
  for (const m of markersToMove(made, cwd, { skip: current, tolerate: failed })) {
    if (failed.has(m.installDir)) {
      // Reported already; a marker crew can't rewrite keeps the old tap.
      if (!tryRewriteMarker(m, tapsByName)) stillNamed.add(m.move.fromTap);
    } else rewriteMarker(m, tapsByName);
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

/**
 * A marker a move claims: one still naming the move's old tap — or, in a
 * tolerated folder, one crew couldn't read (`undefined`), which might.
 */
interface MarkerToMove {
  readonly installDir: string;
  readonly marker: Marker | undefined;
  readonly move: Reattribution;
}

/** The root `baseFor` resolves `move`'s install folders against: the project's, or `cwd` at user scope. */
function rootOf(move: Reattribution, cwd: string): string {
  return move.projectRoot ?? cwd;
}

/**
 * The markers `moves` claim, once per folder — agents sharing a skills
 * folder (§7.2) share its one marker — never reading a folder in `skip`.
 * In a folder in `tolerate`, a marker crew can't parse names nothing, and
 * one it can't read is claimed as `undefined`; elsewhere a failed read
 * throws. A marker whose `agents` isn't a list isn't anyone's.
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
      const marker = readMarker(installDir, folders.tolerate?.has(installDir) === true);
      if (marker === "unknown") {
        seen.add(installDir);
        found.push({ installDir, marker: undefined, move });
        continue;
      }
      // No marker, one this adapter doesn't own, or one for another
      // skill or tap: not this move's. The old tap may still own other
      // skills, so only markers naming it move.
      if (!(Array.isArray(marker?.agents) && marker.agents.includes(adapter.name))) continue;
      seen.add(installDir);
      if (marker.name === move.name && marker.tap_name === move.fromTap) {
        found.push({ installDir, marker, move });
      }
    }
  }
  return found;
}

/**
 * The marker in `installDir`. A `tolerant` read returns null instead of
 * throwing for one crew can't parse (it names nothing), and "unknown" for
 * one it can't read (it might name a tap).
 */
function readMarker(installDir: string, tolerant: boolean): Marker | null | "unknown" {
  try {
    return tryReadJson<Marker>(join(installDir, ".crew.json"));
  } catch (err) {
    if (!tolerant) throw err;
    return err instanceof SyntaxError ? null : "unknown";
  }
}

/** Rewrite a failed copy's marker if crew can; false when it can't read or replace it. */
function tryRewriteMarker(m: MarkerToMove, tapsByName: ReadonlyMap<string, TapConfig>): boolean {
  if (m.marker === undefined) return false;
  try {
    rewriteMarker(m, tapsByName);
    return true;
  } catch {
    return false;
  }
}

function rewriteMarker(m: MarkerToMove, tapsByName: ReadonlyMap<string, TapConfig>): void {
  const tap = tapsByName.get(m.move.toTap);
  if (!tap || m.marker === undefined) return;
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
