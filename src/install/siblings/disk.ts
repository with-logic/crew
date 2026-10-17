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
import { isRefusedSourceFolder, type SourceBoundary } from "../../sources/source-boundary.ts";
import { isGoneError, unreadablePathError } from "../../util/errno.ts";
import { isDirectory } from "../../util/fs.ts";
import type { SiblingEntry } from "./index.ts";

/**
 * What the sibling at `path` is: a skill directory — or, in a gist, a
 * skill file (§9 step 5) — whether it is a folder leading out of
 * `boundary`, skill or not (one named for a dependency fails it, C-SPEC-17),
 * and the name it declares when it is a skill inside it whose name can be
 * read.
 */
export function readSiblingEntry(
  tap: TapConfig,
  path: string,
  boundary: SourceBoundary,
): SiblingEntry {
  const gist = isGistTap(tap);
  const folder = !gist && isDirectory(path);
  const skill = gist ? isGistSkillCandidate(path) : folder && hasSkillMd(path);
  const leadsOut = folder && isRefusedSourceFolder(boundary, path);
  return { skill, leadsOut, declared: skill && !leadsOut ? nameOrNull(path) : null };
}

/** The name the skill at `path` declares; null when it can't be read. */
function nameOrNull(path: string): string | null {
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
