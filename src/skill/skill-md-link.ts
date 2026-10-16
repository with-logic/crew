/**
 * A folder skill's `SKILL.md` as a symlink (§9 step 4, §10.1).
 *
 * crew never follows a link out of a skill (CLAUDE.md design decision
 * 9), and copies one as a link, so a `SKILL.md` may link only to a file
 * inside its own folder. One leading anywhere else is refused before
 * anything is read through it — judged by where it points, so a link
 * left dangling by an export of just the skill's folder is still out.
 */

import { lstatSync, readlinkSync, realpathSync } from "node:fs";
import { isAbsolute, join, normalize, relative } from "node:path";
import { CrewError } from "../core/errors.ts";
import { isGoneError } from "../util/errno.ts";
import { climbsOut } from "../util/relative-path.ts";

/** The next step for a `SKILL.md` that isn't a regular file in its folder. */
export const SKILL_MD_REMEDY =
  "Make the skill's SKILL.md a regular file, or a link to a file inside the skill's folder.";

/**
 * True when `folder`'s `SKILL.md` is a symlink that leads out of the
 * folder. The copy keeps the link's text and reads it from the store and
 * each install, so the text itself must stay inside: an absolute link, or
 * one that climbs out (even to come back), is out. So is one that
 * resolves outside, through another link. No `SKILL.md` at all — or one
 * that dangles or loops inside, or a `folder` that is now a file — is not
 * out: it is reported as no `SKILL.md`. Any other failure to look is
 * thrown as the raw filesystem error.
 */
export function skillMdLinksOut(folder: string): boolean {
  const skillMd = join(folder, "SKILL.md");
  try {
    if (!lstatSync(skillMd).isSymbolicLink()) return false;
    const text = readlinkSync(skillMd);
    if (isAbsolute(text) || climbsOut(normalize(text))) return true;
    return climbsOut(relative(realpathSync(folder), realpathSync(skillMd)));
  } catch (err) {
    if (isGoneError(err)) return false;
    throw err;
  }
}

/**
 * `invalid_skill` for a `SKILL.md` that links out of `folder`, naming the
 * skill as `shown` — on update its path in the tap, not crew's clone.
 */
export function skillMdOutsideError(folder: string, shown = folder): CrewError {
  return new CrewError(
    "invalid_skill",
    `the SKILL.md of \`${shown}\` links outside its skill's folder — crew never reads through a link out of a skill, and copies one as a link`,
    { path: folder },
    SKILL_MD_REMEDY,
  );
}
