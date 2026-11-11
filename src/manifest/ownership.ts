/**
 * Manifest ownership in state (§9.2, §11.1).
 *
 * `manifest: true` on a project-scope state entry means a project manifest
 * at that entry's `project_root` accounts for the skill: it is in the
 * manifest's resolved install set, which is every skill a manifest line
 * expands to plus every dependency resolved with them. It does not mean
 * the skill is named on a line of its own.
 */

import type { StateEntry, StateFile } from "../core/types.ts";

/** True when `entry` is installed at project scope under `projectRoot`. */
function isInstalledAt(entry: StateEntry, projectRoot: string): boolean {
  return entry.scope === "project" && entry.project_root === projectRoot;
}

/**
 * Mark every entry at `projectRoot` whose name is in `resolved` — the
 * manifest's resolved install set — as manifest-owned. Returns `state`
 * itself when nothing changes, so a caller can skip the write.
 */
export function claimForManifest(
  state: StateFile,
  projectRoot: string,
  resolved: ReadonlySet<string>,
): StateFile {
  const isUnclaimed = (entry: StateEntry): boolean =>
    isInstalledAt(entry, projectRoot) && resolved.has(entry.name) && entry.manifest !== true;
  if (!state.installations.some(isUnclaimed)) return state;
  return {
    schema_version: 1,
    installations: state.installations.map((entry) =>
      isUnclaimed(entry) ? { ...entry, manifest: true } : entry,
    ),
  };
}

/**
 * A skill that `crew update` adds while re-expanding a tap (§10.1.1) joins
 * the entries already installed from that tap at the same install location.
 * If the manifest owns those, it owns the newcomer too: both came from the
 * same manifest line.
 */
export function inheritManifestOwnership(added: StateEntry, state: StateFile): StateEntry {
  const ownedSibling = state.installations.some(
    (entry) =>
      entry.manifest === true &&
      entry.source.tap === added.source.tap &&
      entry.scope === added.scope &&
      entry.project_root === added.project_root,
  );
  return ownedSibling ? { ...added, manifest: true } : added;
}
