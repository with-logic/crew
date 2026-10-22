/**
 * Child-skill discovery for tap re-expansion (§10.1.1).
 *
 * Re-expansion needs declared skill names and tap-relative paths for
 * every currently visible child in a tap. This module keeps that
 * shallow discovery separate from the update orchestration.
 */

import type { TapConfig } from "../core/types.ts";
import type { GitDiscoveryWarnings } from "../sources/discovery.ts";
import { isSourceDirectory } from "../sources/read.ts";
import { indexTap, type RejectedTapSkill } from "./tap-index.ts";

export interface CurrentTapChild {
  readonly name: string;
  readonly path: string;
  readonly tapRelativePath: string;
}

export interface CurrentTapCatalog {
  readonly children: readonly CurrentTapChild[];
  readonly skipped: readonly RejectedTapSkill[];
}

export function currentTapChildren(
  tap: TapConfig,
  home: string,
  rootDir: string,
  discovery?: GitDiscoveryWarnings,
): CurrentTapCatalog {
  const children: CurrentTapChild[] = [];
  const skipped: RejectedTapSkill[] = [];
  if (!isSourceDirectory(rootDir, tap.kind === "path")) return { children, skipped };
  // `rootDir` is the caller's already-materialized root — the scratch
  // export of the group's ref, when it tracks one. Indexing the live
  // clone instead would discover children that don't exist at that
  // revision (§10.1.1).
  const index = indexTap(tap, home, rootDir, discovery);
  for (const locs of index.skills.values()) {
    for (const loc of locs) {
      children.push({ name: loc.name, path: loc.path, tapRelativePath: loc.tapRelativePath });
    }
  }
  return { children, skipped: index.skipped };
}

export function groupChildrenByName(
  children: readonly CurrentTapChild[],
): Map<string, CurrentTapChild[]> {
  const byName = new Map<string, CurrentTapChild[]>();
  for (const child of children) {
    const locs = byName.get(child.name);
    if (locs) locs.push(child);
    else byName.set(child.name, [child]);
  }
  return byName;
}
