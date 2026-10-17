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

import { lstatSync, type Stats } from "node:fs";
import { hasMarkdownExtension } from "../core/gist-url.ts";
import { isGoneError, unreadablePathError } from "../util/errno.ts";

/**
 * True iff `path` is a skill file: a regular `.md` file. Nothing usable
 * there (§10.1's gone) is no skill file; any other failure to look — a
 * folder on the way crew can't search, say — throws `source_unreachable`
 * naming `path` (§13), so a caller never sees a raw filesystem error.
 */
export function isSkillFile(path: string): boolean {
  if (!hasMarkdownExtension(path)) return false;
  let entry: Stats;
  try {
    entry = lstatSync(path);
  } catch (err) {
    if (isGoneError(err)) return false;
    throw unreadablePathError(path, err);
  }
  return entry.isFile();
}
