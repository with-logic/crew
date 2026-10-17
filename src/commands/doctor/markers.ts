/**
 * Marker-index construction for `crew doctor` (§11.2).
 *
 * Walks every adapter's user base once, then every distinct
 * `project_root` in state (plus the current cwd) for project-scope
 * markers. A `project_root` that doesn't exist on disk is silently
 * skipped — `checkProjectRoots` already reports it, so reporting
 * again here would be noise.
 *
 * When multiple adapters share an install path (§7.2), the same
 * physical marker would be read once per adapter. We dedupe by
 * `(scope, installDir)` so each marker appears exactly once in the index.
 *
 * A marker crew can't read or parse, one missing a field it records
 * (`isCompleteMarker`), or a skills folder it can't list or look at,
 * doesn't stop the walk: it is recorded as unreadable (check 9), so the
 * checks report it and repair keeps the state entries it hides — and
 * writes nothing from such a marker. `agents/list.ts` lists installs too,
 * but for callers that stop at the first marker they can't read.
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { type AgentAdapter, baseFor, type InstalledSkillRecord } from "../../agents/adapter.ts";
import { isCompleteMarker, markerFieldProblem } from "../../agents/marker-fields.ts";
import { inspectMarkerAt } from "../../agents/marker-read.ts";
import { ALL_AGENTS } from "../../agents/registry.ts";
import type { Marker, Scope, StateEntry } from "../../core/types.ts";
import { hasUsableProjectRoot } from "../../state/validation.ts";
import { errnoReason, isGoneError } from "../../util/errno.ts";
import { isDirectory } from "../../util/fs.ts";

export interface MarkerEntry {
  record: InstalledSkillRecord;
  currentHash?: string;
  /** For project-scope markers, the cwd we walked from — used as `project_root` during --repair. */
  projectRoot?: string;
}

/** A path doctor couldn't read (check 9): a marker, or a folder it couldn't list or look into. */
export interface UnreadablePath {
  readonly path: string;
  readonly reason: string;
  /** The install folder whose marker it hides, or the skills folder whose installs it hides. */
  readonly hides: string;
}

/** Every marker doctor could read, and every path it couldn't. */
export interface MarkerIndex {
  readonly markers: readonly MarkerEntry[];
  readonly unreadable: readonly UnreadablePath[];
}

/** True when `m` is a marker of `entry`'s skill at `entry`'s location: its scope and project root. */
export function sameInstall(entry: StateEntry, m: MarkerEntry): boolean {
  return (
    m.record.marker.name === entry.name &&
    m.record.scope === entry.scope &&
    (m.projectRoot ?? null) === (entry.project_root ?? null)
  );
}

/** True when `m` is `entry`'s marker, owned by one of `agents` (by default, the entry's). */
export function ownsInstall(
  entry: StateEntry,
  m: MarkerEntry,
  agents: readonly string[] = entry.agents,
): boolean {
  return sameInstall(entry, m) && agents.some((a) => m.record.marker.agents.includes(a));
}

export function buildMarkerIndex(stateEntries: readonly StateEntry[], cwd: string): MarkerIndex {
  const markers: MarkerEntry[] = [];
  const unreadable = new Map<string, UnreadablePath>();
  const seen = new Set<string>();
  const projectRoots = new Set<string>([cwd]);
  for (const e of stateEntries) {
    if (e.scope === "project" && hasUsableProjectRoot(e)) projectRoots.add(e.project_root);
  }
  for (const adapter of ALL_AGENTS) {
    for (const rec of readInstalls(adapter, "user", cwd, unreadable)) {
      const key = `user\0${rec.installDir}`;
      if (seen.has(key)) continue;
      seen.add(key);
      markers.push({ record: rec });
    }
    for (const root of projectRoots) {
      if (!isDirectory(root)) continue;
      for (const rec of readInstalls(adapter, "project", root, unreadable)) {
        const key = `project\0${rec.installDir}`;
        if (seen.has(key)) continue;
        seen.add(key);
        markers.push({ record: rec, projectRoot: root });
      }
    }
  }
  return { markers, unreadable: [...unreadable.values()] };
}

/**
 * The crew installs `adapter` owns in its skills folder at `scope`, noting
 * in `unreadable` (keyed by path) whatever crew can't read on the way.
 */
function readInstalls(
  adapter: AgentAdapter,
  scope: Scope,
  root: string,
  unreadable: Map<string, UnreadablePath>,
): InstalledSkillRecord[] {
  const base = baseFor(adapter, scope, root);
  if (base === "") return [];
  const note = (path: string, reason: string, hides: string) =>
    unreadable.set(path, { path, reason, hides });
  const records: InstalledSkillRecord[] = [];
  for (const name of listOrNote(base, note)) {
    const installDir = join(base, name);
    const marker = readOrNote(installDir, (path, reason) => note(path, reason, installDir));
    // A marker this adapter doesn't own is another adapter's to list.
    if (!marker?.agents.includes(adapter.name)) continue;
    records.push({ adapter: adapter.name, scope, installDir, marker });
  }
  return records;
}

type Note = (path: string, reason: string, hides: string) => void;

/**
 * `base`'s entries; none when it is gone or no folder. Noted, and none,
 * when crew can't list it — or can't look at it at all, a folder above it
 * being one crew can't search.
 */
function listOrNote(base: string, note: Note): string[] {
  try {
    if (!statSync(base).isDirectory()) return [];
    return readdirSync(base);
  } catch (err) {
    if (!isGoneError(err)) note(base, errnoReason(err), base);
    return [];
  }
}

/**
 * The marker in `installDir`, or null where there is none to use: no
 * install folder, no marker, or a path that can't hold one. One crew
 * can't read or parse, one that is no complete marker (§7.5), or a folder
 * it can't look into, is noted.
 */
function readOrNote(
  installDir: string,
  note: (path: string, reason: string) => void,
): Marker | null {
  try {
    if (!statSync(installDir).isDirectory()) return null;
  } catch (err) {
    if (!isGoneError(err)) note(installDir, errnoReason(err));
    return null;
  }
  const path = join(installDir, ".crew.json");
  const read = inspectMarkerAt(installDir);
  if (read.kind === "none") return null;
  if (read.kind !== "marker") {
    note(path, read.reason);
    return null;
  }
  if (isCompleteMarker(read.marker)) return read.marker;
  note(path, `not a crew marker: missing or invalid \`${markerFieldProblem(read.marker)}\``);
  return null;
}
