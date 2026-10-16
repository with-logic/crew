/**
 * A folder skill's `SKILL.md` as a symlink (§9 step 4, §10.1).
 *
 * crew never reads through a link that could lead out of a skill
 * (CLAUDE.md design decision 9), and copies a link as a link, which then
 * resolves from wherever the copy lives. So a `SKILL.md` may be a symlink
 * only straight to a file inside its own folder: relative text with no
 * `..`, through no other link, to no other link. That is checked from
 * the text and each entry on the way, never by following the link, so it
 * reads the same in a live clone and in an export of just the folder.
 */

import { lstatSync, readlinkSync } from "node:fs";
import { isAbsolute, join, normalize, sep } from "node:path";
import { CrewError } from "../core/errors.ts";
import { isGoneError } from "../util/errno.ts";

/** The next step for a folder skill's `SKILL.md` that isn't a regular file in its folder. */
export const SKILL_MD_NOT_A_FILE_REMEDY =
  "Make the skill's SKILL.md a regular file, or a relative link (no `..`) straight to a file inside the skill's folder.";

/**
 * True when `folder`'s `SKILL.md` is a symlink other than a plain one to
 * a file inside the folder: absolute, with a `..`, or reaching its target
 * through, or at, another link. A plain link to nothing is not: it is
 * left to the caller's check for a regular file (`invalid_skill` at
 * install, gone on update). Any other failure to look is thrown as the
 * raw filesystem error.
 */
export function skillMdLinksOut(folder: string): boolean {
  const skillMd = join(folder, "SKILL.md");
  try {
    if (!lstatSync(skillMd).isSymbolicLink()) return false;
    const text = readlinkSync(skillMd);
    if (isAbsolute(text) || text.split(/[\\/]/).includes("..")) return true;
    let at = folder;
    for (const part of normalize(text).split(sep)) {
      at = join(at, part);
      if (lstatSync(at).isSymbolicLink()) return true;
    }
    return false;
  } catch (err) {
    if (isGoneError(err)) return false;
    throw err;
  }
}

/**
 * `invalid_skill` for a `SKILL.md` that isn't a plain link into `folder`,
 * naming the skill as `shown` — on update its path in the tap, not crew's
 * clone.
 */
export function skillMdOutsideError(folder: string, shown = folder): CrewError {
  return new CrewError(
    "invalid_skill",
    `the SKILL.md of \`${shown}\` isn't a plain link to a file inside its skill's folder — crew never reads through a link that could lead out of a skill, and copies one as a link`,
    { path: folder },
    SKILL_MD_NOT_A_FILE_REMEDY,
  );
}
