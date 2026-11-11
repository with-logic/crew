/**
 * Manifest ownership in state (§9.2, §11.1).
 *
 * `manifest_owned: true` on a project-scope state entry means a project manifest
 * at that entry's `project_root` accounts for the skill: it is in the
 * manifest's resolved install set, which is every skill a manifest line
 * expands to plus every dependency resolved with them. It does not mean
 * the skill is named on a line of its own.
 *
 * The flag outlives membership in one case: an entry that has left the
 * set but whose removal aborted keeps it, so the next bare install tries
 * again. Removal clears it on entries it deliberately keeps.
 */

import type { StateEntry, StateFile } from "../core/types.ts";

/** True when `entry` is installed at project scope under `projectRoot`. */
function isInstalledAt(entry: StateEntry, projectRoot: string): boolean {
  return entry.scope === "project" && entry.project_root === projectRoot;
}

/**
 * Mark every entry at `projectRoot` whose name is in the manifest's
 * resolved install set as manifest-owned. Returns `state`
 * itself when nothing changes, so a caller can skip the write.
 */
export function claimForManifest(
  state: StateFile,
  projectRoot: string,
  resolvedSkillNames: ReadonlySet<string>,
): StateFile {
  const needsManifestClaim = (entry: StateEntry): boolean =>
    isInstalledAt(entry, projectRoot) &&
    resolvedSkillNames.has(entry.name) &&
    entry.manifest_owned !== true;
  if (!state.installations.some(needsManifestClaim)) return state;
  return {
    schema_version: 1,
    installations: state.installations.map((entry) =>
      needsManifestClaim(entry) ? { ...entry, manifest_owned: true } : entry,
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
  // §11.1: only project-scope entries can be manifest-owned.
  if (added.scope !== "project") return added;
  const ownedSibling = state.installations.some(
    (entry) =>
      entry.manifest_owned === true &&
      entry.source.tap === added.source.tap &&
      entry.scope === added.scope &&
      entry.project_root === added.project_root,
  );
  return ownedSibling ? { ...added, manifest_owned: true } : added;
}
