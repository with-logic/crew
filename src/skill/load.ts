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
  return namingSkillFile(path, () => {
    const raw = readSkillMd(path);
    const frontmatter = validateFrontmatter(extractFrontmatter(raw).data);
    return { path, frontmatter, skillMd: raw };
  });
}

/** Load only the declared skill name from `SKILL.md`, for tap indexing. */
export function loadSkillName(path: string): string {
  return namingSkillFile(path, () =>
    validateFrontmatterName(extractFrontmatter(readSkillMd(path)).data),
  );
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

/** How validation messages name the file they are about. */
const SKILL_MD_SUBJECT = "SKILL.md ";

/**
 * Run `load`, naming a skill file in any error it raises. The user's file
 * is `prd.md`, not a `SKILL.md`, so "SKILL.md is missing …" would send
 * them looking for a file they don't have, and a bare "`name: X` has
 * invalid characters" wouldn't say which of a gist's files is wrong.
 */
function namingSkillFile<T>(path: string, load: () => T): T {
  if (!isSkillFile(path)) return load();
  try {
    return load();
  } catch (err) {
    // Reading a regular file and validating it throw only `CrewError`.
    const ce = err as CrewError;
    const file = `\`${basename(path)}\``;
    const message = ce.message.startsWith(SKILL_MD_SUBJECT)
      ? `${file} ${ce.message.slice(SKILL_MD_SUBJECT.length)}`
      : `${file}: ${ce.message}`;
    throw new CrewError(ce.code, message, { ...ce.details, path }, ce.remedy);
  }
}
