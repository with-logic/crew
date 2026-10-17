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
 * A marker crew can't read or parse, or a skills folder it can't list,
 * doesn't stop the walk: it is recorded as unreadable (check 9), so the
 * checks report it and repair keeps the state entries it hides.
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { type AgentAdapter, baseFor, type InstalledSkillRecord } from "../../agents/adapter.ts";
import { asMarkerObject, isNotAMarkerError } from "../../agents/marker-read.ts";
import { ALL_AGENTS } from "../../agents/registry.ts";
import type { Marker, Scope, StateEntry } from "../../core/types.ts";
import { hasUsableProjectRoot } from "../../state/validation.ts";
import { errnoReason, isGoneError } from "../../util/errno.ts";
import { isDirectory } from "../../util/fs.ts";
import { tryReadJson } from "../../util/json.ts";

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
  readonly markers: MarkerEntry[];
  readonly unreadable: readonly UnreadablePath[];
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
  if (base === "" || !isDirectory(base)) return [];
  const records: InstalledSkillRecord[] = [];
  for (const name of listOrNote(base, unreadable)) {
    const installDir = join(base, name);
    const marker = readOrNote(installDir, unreadable);
    // A marker this adapter doesn't own is another adapter's to list.
    if (!(marker && Array.isArray(marker.agents) && marker.agents.includes(adapter.name))) continue;
    records.push({ adapter: adapter.name, scope, installDir, marker: marker as Marker });
  }
  return records;
}

/** `base`'s entries; none, noted, when crew can't list it. */
function listOrNote(base: string, unreadable: Map<string, UnreadablePath>): string[] {
  try {
    return readdirSync(base);
  } catch (err) {
    unreadable.set(base, { path: base, reason: errnoReason(err), hides: base });
    return [];
  }
}

/**
 * The marker in `installDir`, or null where there is none to read: no
 * install folder, no marker, or a path that can't hold one. One crew
 * can't read or parse, or a folder it can't look into, is noted.
 */
function readOrNote(
  installDir: string,
  unreadable: Map<string, UnreadablePath>,
): ReturnType<typeof asMarkerObject> {
  const note = (path: string, reason: string) =>
    unreadable.set(path, { path, reason, hides: installDir });
  try {
    if (!statSync(installDir).isDirectory()) return null;
  } catch (err) {
    if (!isGoneError(err)) note(installDir, errnoReason(err));
    return null;
  }
  const path = join(installDir, ".crew.json");
  let value: unknown;
  try {
    value = tryReadJson<unknown>(path);
  } catch (err) {
    if (err instanceof SyntaxError) note(path, "not valid JSON");
    else if (!isNotAMarkerError(err)) note(path, errnoReason(err));
    return null;
  }
  const marker = asMarkerObject(value);
  if (value !== null && marker === null) note(path, "not a JSON object");
  return marker;
}
