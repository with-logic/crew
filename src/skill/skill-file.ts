/**
 * Skill files (§9 step 5, "Gists").
 *
 * A skill is a directory holding `SKILL.md` — except in a gist, which
 * cannot contain directories, so each skill there is one `.md` file
 * whose contents are its SKILL.md. Loading, staging, and discovery all
 * need to tell the two shapes apart, and this is the one test they
 * share: only a gist's discovery and its `//<file>` selection (both
 * `.md`-only) ever hand them such a path.
 *
 * The test never follows a symlink (CLAUDE.md design decision #9): a
 * committed link must not stand in for a skill file, or crew would read
 * bytes from outside the source.
 */

import { lstatSync } from "node:fs";
import { isSkillFileName } from "../core/gist-url.ts";

/** True iff `path` is a skill file: a regular `.md` file. */
export function isSkillFile(path: string): boolean {
  if (!isSkillFileName(path)) return false;
  return lstatSync(path, { throwIfNoEntry: false })?.isFile() ?? false;
}
