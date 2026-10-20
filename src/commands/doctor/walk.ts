/**
 * One skills folder's walk for `crew doctor` (§11.2 checks 1 and 9): the
 * crew installs an agent owns there, each marker read and judged
 * (`./usable-marker.ts`), and whatever crew can't read or use on the way
 * noted, so the checks report it and repair keeps what it hides. The
 * index over every folder: `./markers.ts`.
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { type AgentAdapter, baseFor, type InstalledSkillRecord } from "../../agents/adapter.ts";
import { inspectMarkerAt } from "../../agents/marker-read.ts";
import type { Marker, Scope } from "../../core/types.ts";
import { errnoReason, isGoneError } from "../../util/errno.ts";
import type { UncheckedPath } from "./markers.ts";
import { type ScopeFolders, scopesReading } from "./scope-folders.ts";
import { usableMarker } from "./usable-marker.ts";

/** Records a path crew can't read or use, and what it hides. */
export type Note = (
  path: string,
  reason: string,
  hides: string,
  kind?: UncheckedPath["kind"],
) => void;

/**
 * The crew installs `adapter` owns in its skills folder at `scope`, noting
 * whatever crew can't read or use on the way; `folders` says which
 * scopes' walks read that folder.
 */
export function readInstalls(
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
    const marker = readOrNote(
      installDir,
      { adapter: adapter.name, scope, scopesHere },
      (path, reason, kind) => note(path, reason, installDir, kind),
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

/** How a marker crew couldn't take is noted, for each way inspection can fail (check 9). */
const NOTED_AS: { readonly [K in "unreadable" | "invalid"]: UncheckedPath["kind"] } = {
  unreadable: "unreadable",
  invalid: "unusable",
};

/**
 * The marker in `installDir`, found on `at.scope`'s walk, or null where
 * there is none to use: no install folder, no marker, a path that can't
 * hold one, or the other scope's marker its own walk reads. One crew can't
 * read, or a folder it can't look into, is noted as unreadable; one it
 * read but can't use (`usableMarker`) as unusable.
 */
function readOrNote(
  installDir: string,
  at: {
    readonly adapter: string;
    readonly scope: Scope;
    readonly scopesHere: ReadonlySet<Scope>;
  },
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
    note(path, read.reason, NOTED_AS[read.kind]);
    return null;
  }
  const use = usableMarker(read.marker, installDir, at);
  if (use.kind === "usable") return use.marker;
  if (use.kind === "unusable") {
    note(path, use.reason, "unusable");
    return null;
  }
  // Another walk's to judge — the only kind left, so a new one fails here.
  use.kind satisfies "elsewhere";
  return null;
}
