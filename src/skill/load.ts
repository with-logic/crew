/**
 * Load a skill from disk: read its `SKILL.md`, parse and validate
 * frontmatter, and return a structured `LoadedSkill`.
 *
 * `loadSkill` is the boundary between raw filesystem state and validated
 * domain objects. Every code path that wants to install, describe, or hash
 * a skill goes through here first.
 *
 * A skill is usually a directory containing `SKILL.md`. A gist's skills
 * are single files instead (§9 step 5, "Gists"): the skill file at
 * `path` IS the skill's `SKILL.md`, and its errors name that file.
 */

import { lstatSync, realpathSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { CrewError } from "../core/errors.ts";
import type { LoadedSkill } from "../core/types.ts";
import { errnoReason } from "../util/errno.ts";
import { exists, readText } from "../util/fs.ts";
import { climbsOut } from "../util/relative-path.ts";
import { extractFrontmatter } from "./frontmatter.ts";
import { isSkillFile } from "./skill-file.ts";
import { validateFrontmatter, validateFrontmatterName } from "./validate.ts";

/**
 * Load and validate the skill at `path` — a directory, or a gist's skill
 * file. Throws `invalid_skill` for a bad skill, and `source_unreachable`
 * for a `SKILL.md` crew can't read.
 */
export function loadSkill(path: string): LoadedSkill {
  // Read outside the wrapper: a read failure already names its path.
  const raw = readSkillMd(path);
  return withSkillFileErrors(path, (subject) => ({
    path,
    frontmatter: validateFrontmatter(extractFrontmatter(raw, subject).data, subject),
    skillMd: raw,
  }));
}

/** Load only the declared skill name from `SKILL.md`, for tap indexing. */
export function loadSkillName(path: string): string {
  const raw = readSkillMd(path);
  return withSkillFileErrors(path, (subject) =>
    validateFrontmatterName(extractFrontmatter(raw, subject).data, subject),
  );
}

/**
 * The next step when crew can't read or look at a skill's path: its
 * `SKILL.md` here, or its location on update (`acquire/live-skill-path.ts`).
 */
export const UNREADABLE_REMEDY =
  "Check that it is readable by you (its permissions, and its folder's).";

/** True iff `path` contains a `SKILL.md`. Does not validate. */
export function hasSkillMd(path: string): boolean {
  return exists(join(path, "SKILL.md"));
}

/**
 * The text of the `SKILL.md` for the skill at `path` — a skill file, or a
 * directory's own. Every failure is a `CrewError` naming the path, so
 * discovery skips this one candidate (§9 step 4) rather than aborting: a
 * `SKILL.md` that is missing or not a file, or that links out of its
 * skill's folder, is the skill's own fault (`invalid_skill`); one crew
 * can't read is the local filesystem's (`source_unreachable`), and is
 * never blamed on the skill's author.
 */
function readSkillMd(path: string): string {
  const skillFile = isSkillFile(path);
  const skillMdPath = skillFile ? path : join(path, "SKILL.md");
  let raw: string | null = null;
  try {
    if (statSync(skillMdPath, { throwIfNoEntry: false })?.isFile()) raw = readText(skillMdPath);
  } catch (err) {
    throw new CrewError(
      "source_unreachable",
      `couldn't read \`${skillMdPath}\` — ${errnoReason(err)}`,
      { path },
      UNREADABLE_REMEDY,
    );
  }
  if (raw === null) {
    const message = exists(skillMdPath)
      ? `\`${skillMdPath}\` isn't a regular file — a skill's SKILL.md must be one`
      : `no SKILL.md in \`${path}\` — every skill directory needs one`;
    throw new CrewError("invalid_skill", message, { path });
  }
  // §9 step 4: crew copies a link as a link, so a `SKILL.md` linking out of
  // its folder would leave the installed skill without one. A gist's skill
  // file is never a link (`isSkillFile`).
  if (!skillFile && linksOutOfFolder(path, skillMdPath)) {
    throw new CrewError(
      "invalid_skill",
      `\`${skillMdPath}\` links outside its skill's folder — crew copies a link as a link, so the installed skill would have no SKILL.md`,
      { path },
    );
  }
  return raw;
}

/** True when `skillMd`, already read, is a link to somewhere outside `folder`. */
function linksOutOfFolder(folder: string, skillMd: string): boolean {
  if (!lstatSync(skillMd).isSymbolicLink()) return false;
  return climbsOut(relative(realpathSync(folder), realpathSync(skillMd)));
}

/**
 * Run `validate` with the name its messages give the file. A skill file
 * is `prd.md`, not a `SKILL.md`, so "SKILL.md is missing …" would send
 * the user looking for a file they don't have; and a message that names
 * no file at all ("`name: X` has invalid characters") gets the file's
 * name in front, or it wouldn't say which of a gist's files is wrong.
 */
function withSkillFileErrors<T>(path: string, validate: (subject: string) => T): T {
  if (!isSkillFile(path)) return validate("SKILL.md");
  const subject = `\`${basename(path)}\``;
  try {
    return validate(subject);
  } catch (err) {
    // Parsing and validating frontmatter throw only `CrewError`.
    const ce = err as CrewError;
    const message = ce.message.startsWith(subject) ? ce.message : `${subject}: ${ce.message}`;
    const remedy = ce.remedy === undefined ? skillFileRemedy(path) : ce.remedy;
    throw new CrewError(ce.code, message, { ...ce.details, path }, remedy);
  }
}

/** The next step for an invalid skill file: its own frontmatter, not a SKILL.md. */
export function skillFileRemedy(path: string): string {
  return `Check \`${basename(path)}\`'s frontmatter against the Agent Skills spec: https://agentskills.io/specification. In a gist, that file is the skill's SKILL.md.`;
}
