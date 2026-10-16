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

import { basename, join } from "node:path";
import { CrewError } from "../core/errors.ts";
import type { LoadedSkill } from "../core/types.ts";
import { exists, readText } from "../util/fs.ts";
import { extractFrontmatter } from "./frontmatter.ts";
import { isSkillFile } from "./skill-file.ts";
import { validateFrontmatter, validateFrontmatterName } from "./validate.ts";

/** Load and validate the skill at `path`. Throws `invalid_skill` on any failure. */
export function loadSkill(path: string): LoadedSkill {
  // Read outside the wrapper: an I/O failure stays the plain error it is.
  const raw = readSkillMd(path);
  return withSkillFileErrors(path, () => ({
    path,
    frontmatter: validateFrontmatter(extractFrontmatter(raw).data),
    skillMd: raw,
  }));
}

/** Load only the declared skill name from `SKILL.md`, for tap indexing. */
export function loadSkillName(path: string): string {
  const raw = readSkillMd(path);
  return withSkillFileErrors(path, () => validateFrontmatterName(extractFrontmatter(raw).data));
}

/** True iff `path` contains a `SKILL.md`. Does not validate. */
export function hasSkillMd(path: string): boolean {
  return exists(join(path, "SKILL.md"));
}

/** The text of the `SKILL.md` for the skill at `path` — a skill file, or a directory's own. */
function readSkillMd(path: string): string {
  const skillMdPath = isSkillFile(path) ? path : join(path, "SKILL.md");
  if (!exists(skillMdPath)) {
    throw new CrewError(
      "invalid_skill",
      `no SKILL.md in \`${path}\` — every skill directory needs one`,
      { path },
    );
  }
  return readText(skillMdPath);
}

/**
 * How `frontmatter.ts` and `validate.ts` name the file a message is about.
 * Messages that start with it are re-subjected to a skill file's name;
 * any other message gets the name as a `<file>: ` prefix.
 */
const SKILL_MD_SUBJECT = "SKILL.md ";

/**
 * Run `validate`, naming a skill file in any error it raises. The user's
 * file is `prd.md`, not a `SKILL.md`, so "SKILL.md is missing …" would
 * send them looking for a file they don't have, and a bare "`name: X` has
 * invalid characters" wouldn't say which of a gist's files is wrong.
 */
function withSkillFileErrors<T>(path: string, validate: () => T): T {
  if (!isSkillFile(path)) return validate();
  try {
    return validate();
  } catch (err) {
    // Parsing and validating frontmatter throw only `CrewError`.
    const ce = err as CrewError;
    const file = `\`${basename(path)}\``;
    const message = ce.message.startsWith(SKILL_MD_SUBJECT)
      ? `${file} ${ce.message.slice(SKILL_MD_SUBJECT.length)}`
      : `${file}: ${ce.message}`;
    throw new CrewError(
      ce.code,
      message,
      { ...ce.details, path },
      ce.remedy ?? skillFileRemedy(path),
    );
  }
}

/** The next step for an invalid skill file: its own frontmatter, not a SKILL.md. */
export function skillFileRemedy(path: string): string {
  return `Check \`${basename(path)}\`'s frontmatter against the Agent Skills spec: https://agentskills.io/specification. In a gist, that file is the skill's SKILL.md.`;
}
