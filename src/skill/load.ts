/**
 * Load a skill from disk: read its `SKILL.md`, parse and validate
 * frontmatter, and return a structured `LoadedSkill`.
 *
 * `loadSkill` is the boundary between raw filesystem state and validated
 * domain objects. Every code path that wants to install, describe, or hash
 * a skill goes through here first.
 */

import { join } from "node:path";
import { CrewError } from "../core/errors.ts";
import type { LoadedSkill } from "../core/types.ts";
import { exists, readText } from "../util/fs.ts";
import { extractFrontmatter } from "./frontmatter.ts";
import { validateFrontmatter, validateFrontmatterName } from "./validate.ts";

/** Load and validate the skill at `path`. Throws `invalid_skill` on any failure. */
export function loadSkill(path: string): LoadedSkill {
  const skillMdPath = join(path, "SKILL.md");
  if (!exists(skillMdPath)) {
    throw new CrewError(
      "invalid_skill",
      `no SKILL.md in \`${path}\` — every skill directory needs one`,
      { path },
    );
  }
  const raw = readText(skillMdPath);
  const { data } = extractFrontmatter(raw);
  const frontmatter = validateFrontmatter(data);
  return { path, frontmatter, skillMd: raw };
}

/** Load only the declared skill name from `SKILL.md`, for tap indexing. */
export function loadSkillName(path: string): string {
  const raw = readText(join(path, "SKILL.md"));
  const { data } = extractFrontmatter(raw);
  return validateFrontmatterName(data);
}

/** True iff `path` contains a `SKILL.md`. Does not validate. */
export function hasSkillMd(path: string): boolean {
  return exists(join(path, "SKILL.md"));
}
