/**
 * Garbage collection for the store (§10.1 step 4).
 *
 * After every update run, any `store/<name>@<short-sha>/` entry that is
 * no longer referenced by a state entry is deleted. `crew cache clean`
 * shares this machinery and also empties the ephemeral `cache/` tree.
 */

import { join } from "node:path";
import { crewHome, paths } from "../core/paths.ts";
import type { StateFile } from "../core/types.ts";
import { isDirectory, listDir, rmrf } from "../util/fs.ts";

/**
 * Compute the set of store entries still in use.
 *
 * `shortShaFor` keys a git source by its resolved SHA and a path
 * source by the first 8 chars of the directory's content hash — which
 * state records in `content_hash`. Reconstructing both here keeps a
 * live path-source entry out of the orphan list.
 */
export function referencedStoreEntries(state: StateFile): Set<string> {
  const names = new Set<string>();
  for (const inst of state.installations) {
    const short =
      inst.resolved_sha === null
        ? inst.content_hash.slice("sha256:".length, "sha256:".length + 8)
        : inst.resolved_sha.slice(0, 8);
    names.add(`${inst.name}@${short}`);
  }
  return names;
}

/**
 * Names of store entries no state entry references. Path-source
 * entries are indistinguishable from stale ones here, so anything
 * unreferenced is reported; it gets recreated on the next install.
 */
export function orphanStoreEntries(state: StateFile, home: string = crewHome()): string[] {
  const ref = referencedStoreEntries(state);
  const storeDir = paths(home).storeDir;
  if (!isDirectory(storeDir)) {
    return [];
  }
  const orphans: string[] = [];
  for (const name of listDir(storeDir)) {
    if (!isDirectory(join(storeDir, name))) {
      continue;
    }
    if (ref.has(name)) {
      continue;
    }
    orphans.push(name);
  }
  return orphans;
}

/** Remove unreferenced store entries. Returns the names removed. */
export function garbageCollectStore(state: StateFile, home: string = crewHome()): string[] {
  const storeDir = paths(home).storeDir;
  const removed = orphanStoreEntries(state, home);
  for (const name of removed) {
    rmrf(join(storeDir, name));
  }
  return removed;
}
