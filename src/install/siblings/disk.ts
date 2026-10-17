/**
 * Reading a parent skill's siblings off disk for dependency lookup (§9
 * step 6): which entries beside it are skills, the name each declares,
 * and whether crew can look into one. A folder leading out of the
 * repository is never read (C-SPEC-17). Listing the siblings is
 * `listSourceDir`'s.
 */

import { lstatSync } from "node:fs";
import { join } from "node:path";
import { isGistTap } from "../../core/gist-url.ts";
import type { TapConfig } from "../../core/types.ts";
import { hasSkillMd, loadSkillName } from "../../skill/load.ts";
import { isGistSkillCandidate } from "../../sources/gist.ts";
import { leadsOutOfSource, type SourceBoundary } from "../../sources/source-boundary.ts";
import { isGoneError, unreadablePathError } from "../../util/errno.ts";
import { isDirectory } from "../../util/fs.ts";

/** A sibling is a skill directory — or, in a gist, a skill file (§9 step 5). */
export function isSiblingSkill(tap: TapConfig, path: string): boolean {
  if (isGistTap(tap)) return isGistSkillCandidate(path);
  return isDirectory(path) && hasSkillMd(path);
}

/**
 * The name the sibling at `path` declares, when it is a skill that stays
 * inside `boundary`; null otherwise, and when its name can't be read.
 */
export function declaredName(
  tap: TapConfig,
  path: string,
  boundary: SourceBoundary,
): string | null {
  if (!isSiblingSkill(tap, path) || leadsOutOfSource(boundary, path)) return null;
  try {
    return loadSkillName(path);
  } catch {
    return null;
  }
}

/** Throw `source_unreachable` when crew can't look into `folder` for its `SKILL.md`. */
export function assertCanLookForSkillMd(folder: string): void {
  const skillMd = join(folder, "SKILL.md");
  try {
    lstatSync(skillMd);
  } catch (err) {
    if (!isGoneError(err)) throw unreadablePathError(skillMd, err);
  }
}
