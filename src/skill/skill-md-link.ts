/**
 * A folder skill's `SKILL.md` as a symlink (§9 step 4, §10.1).
 *
 * crew never reads through a link that could lead out of a skill
 * (CLAUDE.md design decision 9), and copies a link as a link, which then
 * resolves from wherever the copy lives. So every link on the way to a
 * `SKILL.md` — the file itself, and any link it, or its path, passes
 * through — must have relative text that never climbs above the skill's
 * folder: such a chain resolves the same inside the skill here and in
 * every copy. It must also not lead to the folder's `.crew.json`, which a
 * copy drops and replaces with crew's marker (§7.5), and must not loop.
 * The chain is resolved by hand from each link's text, never followed,
 * so it reads the same in a live clone and in an export of the folder.
 */

import { lstatSync, readlinkSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { CrewError } from "../core/errors.ts";
import { isGoneError, unreadablePathError } from "../util/errno.ts";

/** The next step for a folder skill's `SKILL.md` that isn't a regular file in its folder. */
export const SKILL_MD_NOT_A_FILE_REMEDY =
  "Make the skill's SKILL.md a regular file, or a link to another file inside the skill's folder (not `.crew.json`), with every link on the way relative and never climbing above the folder.";

/** macOS gives up on a chain after 32 links (Linux after 40): refuse before the OS does. */
const MAX_HOPS = 32;

/**
 * Throw `invalid_skill` when `folder`'s `SKILL.md` is reached through a
 * link crew won't follow (see `isRefusedSkillMdLink`), naming the skill
 * as `shown` — on update its path in the tap, not crew's clone. A failure
 * to look on the way is `source_unreachable`, naming the path that failed.
 */
export function assertSkillMdLinkAllowed(folder: string, shown = folder): void {
  let refused: boolean;
  try {
    refused = isRefusedSkillMdLink(folder);
  } catch (err) {
    const where = (err as NodeJS.ErrnoException).path ?? join(folder, "SKILL.md");
    throw unreadablePathError(where, err);
  }
  if (refused) throw refusedSkillMdLinkError(folder, shown);
}

/**
 * True when `folder`'s `SKILL.md` is reached through a link crew won't
 * follow: absolute text, text that isn't UTF-8, a `..` that climbs above
 * the folder, a chain that loops, or one that leads to the folder's
 * `.crew.json`. A
 * `SKILL.md` that is no link, or a chain of allowed links that dangles,
 * is not refused: whether it is a file is the caller's check
 * (`invalid_skill` at install, gone on update). Any other failure to
 * look is thrown as the raw filesystem error.
 */
export function isRefusedSkillMdLink(given: string): boolean {
  // Normalized once, so `dir === folder` holds however the caller spelled it.
  const folder = resolve(given);
  try {
    if (!lstatSync(join(folder, "SKILL.md")).isSymbolicLink()) return false;
    // `dir` only ever holds real folders reached from `folder`, so a `..`
    // from it is exact: here, and in a copy, which keeps every link.
    let dir = folder;
    let rest = ["SKILL.md"];
    let hops = 0;
    while (rest.length > 0) {
      const part = rest[0]!;
      rest = rest.slice(1);
      if (part === "..") {
        if (dir === folder) return true;
        dir = dirname(dir);
        continue;
      }
      if (dir === folder && isMarkerName(part)) return true;
      const at = join(dir, part);
      if (!lstatSync(at).isSymbolicLink()) {
        dir = at;
        continue;
      }
      hops++;
      // Read as bytes: text that isn't UTF-8 decodes lossily, and the
      // kernel would follow a different name than the one checked.
      const raw = readlinkSync(at, { encoding: "buffer" });
      const text = raw.toString("utf8");
      if (isAbsolute(text) || !Buffer.from(text).equals(raw) || hops > MAX_HOPS) return true;
      rest = [...text.split(sep).filter((p) => p !== "" && p !== "."), ...rest];
    }
    return false;
  } catch (err) {
    if (isGoneError(err)) return false;
    throw err;
  }
}

/** The folder's `.crew.json`, as a case- and form-insensitive disk (macOS) also finds it. */
function isMarkerName(part: string): boolean {
  return part.normalize("NFKC").toLowerCase() === ".crew.json";
}

/** `invalid_skill` for a `SKILL.md` reached through a link crew won't follow. */
function refusedSkillMdLinkError(folder: string, shown: string): CrewError {
  return new CrewError(
    "invalid_skill",
    `the SKILL.md of \`${shown}\` is reached through a link crew won't follow — every link on the way must be relative and never climb above the skill's folder, and must not lead to its \`.crew.json\` or loop`,
    { path: folder },
    SKILL_MD_NOT_A_FILE_REMEDY,
  );
}
