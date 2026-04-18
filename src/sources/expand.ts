/**
 * Directory expansion (§9 step 5).
 *
 * If the acquired source's `rootDir` has `SKILL.md` at its root, it
 * represents one skill. Otherwise, we walk EXACTLY one directory level
 * deep and collect every child directory that contains `SKILL.md`.
 *
 * Deeper nesting is ignored. A directory with no root `SKILL.md` and no
 * valid children produces `no_skills_found` (exit 4).
 */

import { join } from "node:path";
import { CrewError } from "../core/errors.ts";
import { hasSkillMd, loadSkill } from "../skill/load.ts";
import type { LoadedSkill } from "../core/types.ts";
import { isDirectory, listDir } from "../util/fs.ts";

/** Expand `rootDir` into one or more loaded skills. */
export function expandSkills(rootDir: string): LoadedSkill[] {
  if (hasSkillMd(rootDir)) {
    return [loadSkill(rootDir)];
  }
  const children: LoadedSkill[] = [];
  for (const name of listDir(rootDir)) {
    const candidate = join(rootDir, name);
    if (!isDirectory(candidate)) continue;
    if (!hasSkillMd(candidate)) continue;
    // Validation happens at load time; invalid children fail fast.
    children.push(loadSkill(candidate));
  }
  if (children.length === 0) {
    throw new CrewError("no_skills_found", `no valid skills at or below ${rootDir}`);
  }
  return children;
}
