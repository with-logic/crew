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

import { lstatSync, type Stats, statSync } from "node:fs";
import { basename, join } from "node:path";
import { CrewError } from "../core/errors.ts";
import type { LoadedSkill } from "../core/types.ts";
import { isGoneError, unreadablePathError } from "../util/errno.ts";
import { readText } from "../util/fs.ts";
import { extractFrontmatter } from "./frontmatter.ts";
import { isSkillFile } from "./skill-file.ts";
import { assertSkillMdLinkAllowed, SKILL_MD_NOT_A_FILE_REMEDY } from "./skill-md-link.ts";
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
 * True iff `path` has an entry named `SKILL.md` — a link counts, even one
 * that leads nowhere, so validation can say what is wrong with it (§9
 * step 4). A folder crew can't look into has none it can see. Does not
 * validate.
 */
export function hasSkillMd(path: string): boolean {
  try {
    return lstatSync(join(path, "SKILL.md"), { throwIfNoEntry: false }) !== undefined;
  } catch {
    return false;
  }
}

/**
 * The text of the `SKILL.md` for the skill at `path` — a skill file, or a
 * directory's own. Every failure is a `CrewError` naming the path, so
 * discovery skips this one candidate (§9 step 4) rather than aborting: a
 * `SKILL.md` that is missing or not a file — a link that leads nowhere
 * included — or that is reached through a link crew won't follow (§9 step
 * 4), is the skill's own fault (`invalid_skill`); one crew can't read is
 * the local filesystem's
 * (`source_unreachable`), and is never blamed on the skill's author.
 */
function readSkillMd(path: string): string {
  const skillFile = isSkillFile(path);
  const skillMdPath = skillFile ? path : join(path, "SKILL.md");
  // §9 step 4: refused before anything is read through it. A gist's skill
  // file is never a link (`isSkillFile`).
  if (!skillFile) assertSkillMdLinkAllowed(path);
  let raw: string | null = null;
  try {
    if (statSync(skillMdPath, { throwIfNoEntry: false })?.isFile()) raw = readText(skillMdPath);
  } catch (err) {
    // A loop above the folder, or a folder on the way that is a file: no
    // SKILL.md either, reported below (a loop inside it was refused by
    // `assertSkillMdLinkAllowed`).
    if (!isGoneError(err)) {
      const where = (err as NodeJS.ErrnoException).path ?? skillMdPath;
      throw unreadablePathError(where, err, "read");
    }
  }
  if (raw === null) throw skillMdNotAFileError(path, skillMdPath);
  return raw;
}

/** `invalid_skill` for a skill whose `SKILL.md` is missing, or isn't a file. */
function skillMdNotAFileError(path: string, skillMdPath: string): CrewError {
  const entry = entryAt(skillMdPath);
  if (entry === undefined) {
    return new CrewError(
      "invalid_skill",
      `no SKILL.md in \`${path}\` — every skill directory needs one`,
      {
        path,
      },
    );
  }
  // A link counts as there: one that dangles or loops isn't a file either.
  const what = entry.isSymbolicLink() ? "is a link that leads to no file" : "isn't a regular file";
  return new CrewError(
    "invalid_skill",
    `\`${skillMdPath}\` ${what} — a skill's SKILL.md must be a file, or a link to one inside its folder`,
    { path },
    SKILL_MD_NOT_A_FILE_REMEDY,
  );
}

/**
 * The entry at `path` without following a link; undefined when nothing
 * usable is there. `readSkillMd` has just looked at the same path, so the
 * only failure left is a gone one (missing, or a file on the way).
 */
function entryAt(path: string): Stats | undefined {
  try {
    return lstatSync(path);
  } catch {
    return undefined;
  }
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
function skillFileRemedy(path: string): string {
  return `Check \`${basename(path)}\`'s frontmatter against the Agent Skills spec: https://agentskills.io/specification. In a gist, that file is the skill's SKILL.md.`;
}
