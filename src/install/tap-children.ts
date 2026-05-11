/**
 * Child-skill discovery for tap re-expansion (§10.1.1).
 *
 * Re-expansion needs declared skill names and tap-relative paths for
 * every currently visible child in a tap. This module keeps that
 * shallow discovery separate from the update orchestration.
 */

import type { TapConfig } from "../core/types.ts";
import { hasSkillMd, loadSkillName } from "../skill/load.ts";
import { isDirectory } from "../util/fs.ts";
import { indexTap } from "./tap-index.ts";

export interface CurrentTapChild {
  readonly name: string;
  readonly path: string;
  readonly tapRelativePath: string;
}

export function currentTapChildren(
  tap: TapConfig,
  home: string,
  rootDir: string,
): CurrentTapChild[] {
  const children: CurrentTapChild[] = [];
  if (!isDirectory(rootDir)) return children;
  if (hasSkillMd(rootDir)) {
    pushLoaded(children, rootDir, "");
    return children;
  }
  const index = indexTap(tap, home);
  for (const locs of index.skills.values()) {
    for (const loc of locs) {
      children.push({ name: loc.name, path: loc.path, tapRelativePath: loc.tapRelativePath });
    }
  }
  return children;
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
