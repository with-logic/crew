/**
 * Whether the manifest a run read is still the one on disk (§9.2, §9.3).
 *
 * A bare `crew install` asks this before removing anything, before each
 * deletion, and one final time before it writes the lockfile and the
 * ownership claims. That final answer covers both writes: nothing looks at
 * `.crewrc` again once they have begun.
 */

import { loadManifestFor, type Manifest } from "../../../manifest/index.ts";

/** True unless the manifest governing the project still lists exactly the same references. */
export function hasChangedOnDisk(snapshot: Manifest): boolean {
  const identity = (manifest: Manifest | null): string =>
    JSON.stringify([manifest?.file, manifest?.entries.map((entry) => entry.ref)]);
  try {
    return identity(loadManifestFor(snapshot.projectRoot)) !== identity(snapshot);
  } catch {
    return true; // Unreadable or invalid now: not the manifest this run installed from.
  }
}
