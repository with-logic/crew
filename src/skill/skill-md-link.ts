/**
 * A folder skill's `SKILL.md` as a symlink (§9 step 4, §10.1).
 *
 * crew never follows a link out of a skill (CLAUDE.md design decision
 * 9), and copies one as a link, so a `SKILL.md` may link only to a file
 * inside its own folder. One leading anywhere else is refused before
 * anything is read through it — judged by its text, so a link left
 * dangling by an export of just the skill's folder is still out.
 */

import { lstatSync, readlinkSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative } from "node:path";
import { CrewError } from "../core/errors.ts";
import { isGoneError } from "../util/errno.ts";
import { climbsOut } from "../util/relative-path.ts";

/** The next step for a folder skill's `SKILL.md` that isn't a regular file in its folder. */
export const SKILL_MD_NOT_A_FILE_REMEDY =
  "Make the skill's SKILL.md a regular file, or a relative link to a file inside the skill's folder.";

/** Enough hops for any real chain; a longer one is a loop, so no `SKILL.md` at all. */
const MAX_HOPS = 40;

/**
 * True when `folder`'s `SKILL.md` is a symlink that leads out of the
 * folder. A copy keeps each link's text, which then resolves from where
 * the copy lives (the store entry, each install), so every hop's text
 * must stay inside the folder as written: an absolute link, or one that
 * climbs out — even to come back in — is out, whether or not its target
 * exists here. The file a chain ends at must also resolve inside, through
 * any folder link on the way. A `SKILL.md` that is missing, or a chain
 * that dangles or loops inside, is not out: it is left to the caller's
 * check for a regular file (`invalid_skill` at install, gone on update).
 * Any other failure to look is thrown as the raw filesystem error.
 */
export function skillMdLinksOut(folder: string): boolean {
  let at = join(folder, "SKILL.md");
  try {
    if (!lstatSync(at).isSymbolicLink()) return false;
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      const text = readlinkSync(at);
      const fromFolder = normalize(join(relative(folder, dirname(at)), text));
      if (isAbsolute(text) || climbsOut(fromFolder)) return true;
      at = join(folder, fromFolder);
      if (!lstatSync(at).isSymbolicLink()) {
        return climbsOut(relative(realpathSync(folder), realpathSync(at)));
      }
    }
    return false;
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
    `the SKILL.md of \`${shown}\` links outside its skill's folder — it must be a regular file, or a relative link (no absolute path, no \`..\` out of the folder) to a file inside it`,
    { path: folder },
    SKILL_MD_NOT_A_FILE_REMEDY,
  );
}
