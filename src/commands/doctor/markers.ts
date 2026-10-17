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
 * a marker. `agents/list.ts` lists installs too,
 * but for callers that stop at the first marker they can't read.
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { type AgentAdapter, baseFor, type InstalledSkillRecord } from "../../agents/adapter.ts";
import { inspectMarkerAt } from "../../agents/marker-read.ts";
import { ALL_AGENTS } from "../../agents/registry.ts";
import type { Marker, Scope, StateEntry } from "../../core/types.ts";
import { hasUsableProjectRoot } from "../../state/validation.ts";
import { errnoReason, isGoneError } from "../../util/errno.ts";
import { lookAtRoot } from "./project-root.ts";
import { type ScopeFolders, scopeFolders, scopesReading } from "./scope-folders.ts";
import { usableMarker } from "./usable-marker.ts";

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

/** Every marker doctor could read, and every path it couldn't. */
export interface MarkerIndex {
  readonly markers: readonly MarkerEntry[];
  readonly unreadable: readonly UncheckedPath[];
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

type Note = (path: string, reason: string, hides: string, kind?: UncheckedPath["kind"]) => void;

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
  return { markers, unreadable: [...unreadable.values()] };
}

/**
 * The crew installs `adapter` owns in its skills folder at `scope`, noting
 * whatever crew can't read or use on the way; `folders` says which
 * scopes' walks read that folder.
 */
function readInstalls(
  adapter: AgentAdapter,
  scope: Scope,
  root: string,
  walk: { readonly note: Note; readonly folders: ScopeFolders },
): InstalledSkillRecord[] {
  const base = baseFor(adapter, scope, root);
  if (base === "") return [];
  const { note } = walk;
  const scopesHere = scopesReading(walk.folders, base);
  const records: InstalledSkillRecord[] = [];
  for (const name of listOrNote(base, note)) {
    // A skill's name never starts with a dot (§9 step 4), so such a folder
    // is no install — crew's own staging leftover (§7.3), say.
    if (name.startsWith(".")) continue;
    const installDir = join(base, name);
    const marker = readOrNote(installDir, { scope, scopesHere }, (path, reason, kind) =>
      note(path, reason, installDir, kind),
    );
    // A marker this adapter doesn't own is another adapter's to list.
    if (!marker?.agents.includes(adapter.name)) continue;
    records.push({ adapter: adapter.name, scope, installDir, marker });
  }
  return records;
}

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
 * The marker in `installDir`, found on `at.scope`'s walk, or null where
 * there is none to use: no install folder, no marker, a path that can't
 * hold one, or the other scope's marker its own walk reads. One crew can't
 * read, or a folder it can't look into, is noted as unreadable; one it
 * read but can't use (`usableMarker`) as unusable.
 */
function readOrNote(
  installDir: string,
  at: { readonly scope: Scope; readonly scopesHere: ReadonlySet<Scope> },
  note: (path: string, reason: string, kind?: UncheckedPath["kind"]) => void,
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
    note(path, read.reason, read.kind === "unreadable" ? "unreadable" : "unusable");
    return null;
  }
  const use = usableMarker(read.marker, installDir, at.scope, at.scopesHere);
  if (use.kind === "usable") return use.marker;
  if (use.kind === "unusable") note(path, use.reason, "unusable");
  return null;
}
