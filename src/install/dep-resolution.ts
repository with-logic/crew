/**
 * Dependency resolution helpers for the install set walker (§9 step 6).
 *
 * Given a parsed dep reference plus the parent skill's tap context,
 * decides which tap should own the dep:
 *
 *   - bare-name dep + parent has a tap → look for a sibling skill in
 *     the same tap (so `dependencies: [bar]` from a skill that came
 *     from `core` resolves to `core/bar`, not to `bar` from some other
 *     tap that happens to have the same name).
 *   - bare-name dep + no sibling found → fall through to the cross-tap
 *     search (handled by the caller via `attributeBareName`).
 *   - qualified or path/git ref → handled by the caller via
 *     `attributeRef` from `tap-attribution.ts`.
 *
 * This module's job is just the sibling lookup; the broader attribution
 * lives in `tap-attribution.ts` and `attribute-bare-name.ts`.
 */

import { join } from "node:path";
import { tapPath } from "../core/paths.ts";
import type { LoadedSkill, TapConfig } from "../core/types.ts";
import { hasSkillMd, loadSkill } from "../skill/load.ts";
import { tapRootDir } from "../sources/acquire/index.ts";
import { isDirectory } from "../util/fs.ts";

/** Result of finding a dep as a sibling within the parent's tap. */
export interface SiblingHit {
  readonly tap: TapConfig;
  readonly tapRelativePath: string;
  readonly loaded: LoadedSkill;
}

/**
 * Look for `depName` as a sibling skill of `parentTapPath` inside the
 * parent's tap clone. Returns null if not found (the dep walker will
 * try cross-tap resolution next).
 */
export function findSiblingDep(
  parent: { tap: TapConfig; tapRelativePath: string },
  depName: string,
  home: string,
): SiblingHit | null {
  const tapClone = parent.tap.kind === "git" ? tapPath(parent.tap.name, home) : parent.tap.path;
  const tapRoot = tapRootDir(tapClone, parent.tap);
  // The parent's own directory inside the tap.
  const parentDir = join(tapRoot, parent.tapRelativePath);
  // A sibling lives at `<parentDir>/../<depName>`.
  const siblingDir = join(parentDir, "..", depName);
  if (!(isDirectory(siblingDir) && hasSkillMd(siblingDir))) return null;
  const loaded = loadSkill(siblingDir);
  // Sibling's path relative to the tap root.
  const tapRelativePath = parent.tapRelativePath
    .split("/")
    .slice(0, -1)
    .concat([depName])
    .filter(Boolean)
    .join("/");
  return { tap: parent.tap, tapRelativePath, loaded };
}
