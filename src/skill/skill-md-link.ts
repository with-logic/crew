/**
 * A folder skill's `SKILL.md` as a symlink (§9 step 4, §10.1).
 *
 * crew never reads through a link that could lead out of a skill
 * (CLAUDE.md design decision 9), and copies a link as a link, which then
 * resolves from wherever the copy lives. So every link on the way to a
 * `SKILL.md` — the file itself, and any folder link its path passes
 * through — must have relative text with no `..`: such a link resolves
 * at or below the folder it sits in, so the chain stays inside the skill,
 * here and in every copy. That is judged from each link's text, resolved
 * by hand, never by following it, so it reads the same in a live clone
 * and in an export of just the folder.
 */

import { lstatSync, readlinkSync } from "node:fs";
import { isAbsolute, join, sep } from "node:path";
import { CrewError } from "../core/errors.ts";
import { isGoneError } from "../util/errno.ts";

/** The next step for a folder skill's `SKILL.md` that isn't a regular file in its folder. */
export const SKILL_MD_NOT_A_FILE_REMEDY =
  "Make the skill's SKILL.md a regular file, or a link to one inside the skill's folder whose every link is relative with no `..`.";

/** Enough hops for any real chain; a longer one is a loop. */
const MAX_HOPS = 40;

/**
 * True when `folder`'s `SKILL.md` is reached through a link crew won't
 * follow: one with absolute text or a `..`, a chain that loops, or one
 * that ends at the folder's `.crew.json` — the one file a copy drops and
 * replaces with crew's own marker (§7.5), so it would read differently. A
 * `SKILL.md` that is no link, or a chain of allowed links that dangles,
 * is not refused: whether it is a file is the caller's check
 * (`invalid_skill` at install, gone on update). Any other failure to
 * look is thrown as the raw filesystem error.
 */
export function isRefusedSkillMdLink(folder: string): boolean {
  try {
    if (!lstatSync(join(folder, "SKILL.md")).isSymbolicLink()) return false;
    let dir = folder;
    let rest = ["SKILL.md"];
    let hops = 0;
    while (rest.length > 0) {
      const part = rest[0]!;
      if (dir === folder && part === ".crew.json") return true;
      const at = join(dir, part);
      rest = rest.slice(1);
      if (!lstatSync(at).isSymbolicLink()) {
        dir = at;
        continue;
      }
      // A link's text resolves from the folder it sits in, `dir`.
      const text = readlinkSync(at);
      const parts = text.split(sep).filter((p) => p !== "" && p !== ".");
      if (isAbsolute(text) || parts.includes("..") || ++hops > MAX_HOPS) return true;
      rest = [...parts, ...rest];
    }
    return false;
  } catch (err) {
    if (isGoneError(err)) return false;
    throw err;
  }
}

/**
 * `invalid_skill` for a `SKILL.md` reached through a link crew won't
 * follow, naming the skill as `shown` — on update its path in the tap,
 * not crew's clone.
 */
export function refusedSkillMdLinkError(folder: string, shown = folder): CrewError {
  return new CrewError(
    "invalid_skill",
    `the SKILL.md of \`${shown}\` is reached through a link crew won't follow — every link on the way must be relative with no \`..\`, so it stays inside the skill's folder, and must not loop`,
    { path: folder },
    SKILL_MD_NOT_A_FILE_REMEDY,
  );
}
