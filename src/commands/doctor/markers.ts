/**
 * Marker-index construction for `crew doctor` (§11.2).
 *
 * Walks every adapter's user base once, then every distinct
 * `project_root` in state (plus the current cwd) for project-scope
 * markers. A `project_root` that doesn't exist on disk is silently
 * skipped — `checkProjectRoots` already reports it, so reporting
 * again here would be noise — while one crew can't look at is noted
 * (check 9), so the entries under it are hidden rather than missing.
 *
 * When multiple adapters share an install path (§7.2), the same
 * physical marker would be read once per adapter. We dedupe by
 * `(scope, installDir)` so each marker appears exactly once in the index.
 *
 * A marker crew can't read or parse, one it can't use (`usableMarker`),
 * or a skills folder or project root it can't list or look at, doesn't
 * stop the walk: it is noted (check 9), so the checks report it and
 * repair keeps the state entries it hides — and writes nothing from such
 * a marker. One folder's walk: `./walk.ts`. `agents/list.ts` lists
 * installs too, but for callers that stop at the first marker they can't read.
 */

import type { InstalledSkillRecord } from "../../agents/adapter.ts";
import { ALL_AGENTS } from "../../agents/registry.ts";
import type { StateEntry } from "../../core/types.ts";
import { hasUsableProjectRoot } from "../../state/validation.ts";
import { lookAtRoot } from "./project-root.ts";
import { scopeFolders } from "./scope-folders.ts";
import { type Note, readInstalls } from "./walk.ts";

export interface MarkerEntry {
  readonly record: InstalledSkillRecord;
  /** For project-scope markers, the cwd we walked from — used as `project_root` during --repair. */
  readonly projectRoot?: string;
}

/**
 * A path doctor couldn't check (check 9): a marker, or a folder it couldn't
 * list or look into. `unreadable` when crew can't read it; `unusable`
 * when what it read is no marker it can use, which the user reinstalls.
 */
export interface UncheckedPath {
  readonly path: string;
  readonly reason: string;
  /** The install folder whose marker it hides, or the skills folder whose installs it hides. */
  readonly hides: string;
  readonly kind: "unreadable" | "unusable";
}

/** Every marker doctor could use, and every path it couldn't read or use (check 9). */
export interface MarkerIndex {
  readonly markers: readonly MarkerEntry[];
  readonly uncheckedPaths: readonly UncheckedPath[];
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
  const unreadable = new Map<string, UncheckedPath>();
  const note: Note = (path, reason, hides, kind = "unreadable") =>
    unreadable.set(path, { path, reason, hides, kind });
  const seen = new Set<string>();
  const projectRoots = new Set<string>([cwd]);
  for (const e of stateEntries) {
    if (e.scope === "project" && hasUsableProjectRoot(e)) projectRoots.add(e.project_root);
  }
  const roots: string[] = [];
  for (const root of projectRoots) {
    const look = lookAtRoot(root);
    if (look.kind === "hidden") note(root, look.reason, root);
    if (look.kind === "usable") roots.push(root);
  }
  for (const adapter of ALL_AGENTS) {
    const folders = scopeFolders(adapter, cwd, roots);
    for (const rec of readInstalls(adapter, "user", cwd, { note, folders })) {
      const key = `user\0${rec.installDir}`;
      if (seen.has(key)) continue;
      seen.add(key);
      markers.push({ record: rec });
    }
    for (const root of roots) {
      for (const rec of readInstalls(adapter, "project", root, { note, folders })) {
        const key = `project\0${rec.installDir}`;
        if (seen.has(key)) continue;
        seen.add(key);
        markers.push({ record: rec, projectRoot: root });
      }
    }
  }
  return { markers, uncheckedPaths: [...unreadable.values()] };
}
