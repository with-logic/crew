/**
 * Whether the manifest a run read is still the one on disk (§9.2, §9.3).
 *
 * A bare `crew install` records ownership and the lockfile at the end of
 * the run. Each of those steps asks this first, so neither acts on a
 * manifest that has since been replaced.
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
