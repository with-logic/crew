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
import { validateFrontmatter } from "./validate.ts";

/** Load and validate the skill at `path`. Throws `invalid_skill` on any failure. */
export function loadSkill(path: string): LoadedSkill {
  const skillMdPath = join(path, "SKILL.md");
  if (!exists(skillMdPath)) {
    throw new CrewError("invalid_skill", `missing SKILL.md in ${path}`);
  }
  const raw = readText(skillMdPath);
  const { data } = extractFrontmatter(raw);
  const frontmatter = validateFrontmatter(data, path);
  return { path, frontmatter, skillMd: raw };
}

/** True iff `path` contains a `SKILL.md`. Does not validate. */
export function hasSkillMd(path: string): boolean {
  return exists(join(path, "SKILL.md"));
}
