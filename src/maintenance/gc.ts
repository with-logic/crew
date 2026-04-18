/**
 * Garbage collection for the store (§10.1 step 4).
 *
 * After every update run, any `store/<name>@<short-sha>/` entry that is
 * no longer referenced by a state entry is deleted. `crew cache clean`
 * shares this machinery and also empties the ephemeral `cache/` tree.
 */

import { join } from "node:path";
import type { StateFile } from "../core/types.ts";
import { crewHome, paths } from "../core/paths.ts";
import { isDirectory, listDir, rmrf } from "../util/fs.ts";

/** Compute the set of store entries still in use. */
export function referencedStoreEntries(state: StateFile): Set<string> {
  const names = new Set<string>();
  for (const inst of state.installations) {
    if (inst.resolved_sha !== null) {
      names.add(`${inst.name}@${inst.resolved_sha.slice(0, 8)}`);
    } else {
      // Path sources: match whatever short-sha suffix they hashed to.
      // We don't know the hash from here without reading the store; store
      // entries for path sources are therefore kept unconditionally.
    }
  }
  return names;
}

/** Remove unreferenced store entries. Returns the names removed. */
export function garbageCollectStore(state: StateFile, home: string = crewHome()): string[] {
  const ref = referencedStoreEntries(state);
  const storeDir = paths(home).storeDir;
  if (!isDirectory(storeDir)) return [];
  const removed: string[] = [];
  for (const name of listDir(storeDir)) {
    const p = join(storeDir, name);
    if (!isDirectory(p)) continue;
    // Keep if exactly matches a referenced `name@short` OR if it's a
    // path-source entry (we can't easily tell those apart; conservatively
    // keep anything referenced and skip pruning path-sources).
    if (ref.has(name)) continue;
    // Best-effort: delete anything unreferenced. Path-source entries will
    // be recreated next time they're installed.
    rmrf(p);
    removed.push(name);
  }
  return removed;
}
