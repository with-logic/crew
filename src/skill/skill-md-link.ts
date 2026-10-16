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
 * copy drops and replaces with crew's marker (§7.5), and must not loop or
 * run longer than crew's limit.
 * The chain is resolved by hand from each link's text, never followed,
 * so it reads the same in a live clone and in an export of the folder.
 */

import { lstatSync, readlinkSync, type Stats } from "node:fs";
import { dirname, isAbsolute, join, sep } from "node:path";
import { CrewError } from "../core/errors.ts";
import { isGoneError, unreadablePathError } from "../util/errno.ts";

/** The next step for a folder skill's `SKILL.md` that isn't a regular file in its folder. */
export const SKILL_MD_NOT_A_FILE_REMEDY =
  "Make the skill's SKILL.md a regular file, or a link to another file inside the skill's folder (not `.crew.json`), with every link on the way relative and never climbing above the folder.";

/**
 * crew's limit on a chain, well under the system's own (32 links on macOS,
 * 40 on Linux), which also counts any link in the path to wherever the
 * skill is installed — so a chain crew allows reads there too.
 */
const MAX_HOPS = 8;

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
 * the folder, a chain that loops or runs past `MAX_HOPS` links, or one
 * that leads to the folder's `.crew.json`. A `SKILL.md` that is no link, or a chain of allowed links
 * that dangles, is not refused: whether it is a file is the caller's
 * check (`invalid_skill` at install, gone on update). Any other failure
 * to look is thrown as the raw filesystem error — a link swapped out
 * between looking at it and reading it, too.
 */
function isRefusedSkillMdLink(folder: string): boolean {
  if (lstatUnlessGone(join(folder, "SKILL.md"))?.isSymbolicLink() !== true) return false;
  // `depth` counts the parts the walk stands below `folder`. `dir` is the
  // last folder it reached through real entries, so a `..` from it is
  // exact here and in a copy, which keeps every link. Past a missing part
  // the system would stop, so nothing more is looked up: each later name
  // is judged as written, and a link there is never read.
  let dir = folder;
  let depth = 0;
  let pastMissing = false;
  // The parts still to walk, the next one last.
  const pending = ["SKILL.md"];
  let hops = 0;
  while (pending.length > 0) {
    const part = pending.pop()!;
    if (part === "..") {
      if (depth === 0) return true;
      depth--;
      if (!pastMissing) dir = dirname(dir);
      continue;
    }
    if (depth === 0 && isMarkerName(part)) return true;
    depth++;
    if (pastMissing) continue;
    const at = join(dir, part);
    const entry = lstatUnlessGone(at);
    if (entry === undefined) {
      pastMissing = true;
      continue;
    }
    if (!entry.isSymbolicLink()) {
      dir = at;
      continue;
    }
    // The link is replaced by its text, which starts from `dir`.
    depth--;
    hops++;
    // Read as bytes: text that isn't UTF-8 decodes lossily, and the
    // kernel would follow a different name than the one checked.
    const raw = readlinkSync(at, { encoding: "buffer" });
    const text = raw.toString("utf8");
    if (isAbsolute(text) || !Buffer.from(text).equals(raw) || hops > MAX_HOPS) return true;
    const parts = text.split(sep).filter((p) => p !== "" && p !== ".");
    for (let i = parts.length - 1; i >= 0; i--) pending.push(parts[i]!);
  }
  return false;
}

/** The entry at `path` without following it; undefined when it is gone. Throws any other failure. */
function lstatUnlessGone(path: string): Stats | undefined {
  try {
    return lstatSync(path);
  } catch (err) {
    if (isGoneError(err) || (err as NodeJS.ErrnoException).code === "ENAMETOOLONG")
      return undefined;
    throw err;
  }
}

/**
 * True when `part` names the folder's `.crew.json` as any disk crew
 * installs to might find it: case- and form-insensitive (APFS), or
 * ignoring invisible format characters such as U+200C (HFS+), as git
 * does for `.git`.
 */
function isMarkerName(part: string): boolean {
  const visible = part.normalize("NFKC").replace(/\p{Default_Ignorable_Code_Point}/gu, "");
  return visible.toLowerCase() === ".crew.json";
}

/** `invalid_skill` for a `SKILL.md` reached through a link crew won't follow. */
function refusedSkillMdLinkError(folder: string, shown: string): CrewError {
  return new CrewError(
    "invalid_skill",
    `the SKILL.md of \`${shown}\` is reached through a link crew won't follow — every link on the way must be relative and never climb above the skill's folder, and must not lead to its \`.crew.json\`, loop, or run past ${MAX_HOPS} links`,
    { path: folder },
    SKILL_MD_NOT_A_FILE_REMEDY,
  );
}
