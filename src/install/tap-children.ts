/**
 * Child-skill discovery for tap re-expansion (§10.1.1).
 *
 * Re-expansion needs declared skill names and tap-relative paths for
 * every currently visible child in a tap. This module keeps that
 * shallow discovery separate from the update orchestration.
 */

import type { TapConfig } from "../core/types.ts";
import { loadSkillName } from "../skill/load.ts";
import { discoveryOf, isRootSkill } from "../sources/expand.ts";
import { isDirectory } from "../util/fs.ts";
import { indexTap } from "./tap-index.ts";
import type { UnloadableCandidate } from "./unloadable-candidates.ts";

export interface CurrentTapChild {
  readonly name: string;
  readonly path: string;
  readonly tapRelativePath: string;
}

/** A tap's current children, and the candidates among them it couldn't name. */
export interface TapChildren {
  readonly children: readonly CurrentTapChild[];
  /** For re-expansion to report (§10.1.1 step 2); a root skill's own is its update's to report. */
  readonly unloadable: readonly UnloadableCandidate[];
}

export function currentTapChildren(tap: TapConfig, home: string, rootDir: string): TapChildren {
  const children: CurrentTapChild[] = [];
  if (!isDirectory(rootDir)) return { children, unloadable: [] };
  if (isRootSkill(rootDir, discoveryOf(tap))) {
    pushLoaded(children, rootDir, "");
    return { children, unloadable: [] };
  }
  // `rootDir` is the caller's already-materialized root — the scratch
  // export of the group's ref, when it tracks one. Indexing the live
  // clone instead would discover children that don't exist at that
  // revision (§10.1.1).
  const index = indexTap(tap, home, rootDir);
  for (const locs of index.skills.values()) {
    for (const loc of locs) {
      children.push({ name: loc.name, path: loc.path, tapRelativePath: loc.tapRelativePath });
    }
  }
  return { children, unloadable: index.unloadable };
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

function pushLoaded(children: CurrentTapChild[], path: string, tapRelativePath: string): void {
  try {
    children.push({ name: loadSkillName(path), path, tapRelativePath });
  } catch {
    // Skip invalid names; same as tap indexing/search behavior.
  }
}
