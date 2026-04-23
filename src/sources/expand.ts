/**
 * Directory expansion (§9 step 5).
 *
 * Three cases, checked in order:
 *   1. Root `SKILL.md` → one skill.
 *   2. Root `skills/` subdirectory present → walk ONE level under
 *      `skills/` and collect every child with a `SKILL.md`. The source
 *      root itself is not walked in this case.
 *   3. Otherwise → walk ONE level under the source root and collect
 *      every child with a `SKILL.md`.
 *
 * Deeper nesting is ignored. A location that produces zero valid
 * skills through the applicable case aborts with `no_skills_found`.
 */

import { join } from "node:path";
import { CrewError } from "../core/errors.ts";
import type { LoadedSkill } from "../core/types.ts";
import { hasSkillMd, loadSkill } from "../skill/load.ts";
import { isDirectory, listDir } from "../util/fs.ts";

/** Expand `rootDir` into one or more loaded skills. */
export function expandSkills(rootDir: string): LoadedSkill[] {
  if (hasSkillMd(rootDir)) {
    return [loadSkill(rootDir)];
  }
  const skillsDir = join(rootDir, "skills");
  const walkRoot = isDirectory(skillsDir) ? skillsDir : rootDir;
  const children = collectSkillChildren(walkRoot);
  if (children.length === 0) {
    throw new CrewError(
      "no_skills_found",
      `no valid skills found at \`${rootDir}\` — expected a SKILL.md there, subdirectories that each contain one, or a \`skills/\` directory of either`,
      { path: rootDir },
    );
  }
  return children;
}

function collectSkillChildren(dir: string): LoadedSkill[] {
  const children: LoadedSkill[] = [];
  for (const name of listDir(dir)) {
    const candidate = join(dir, name);
    if (!isDirectory(candidate)) {
      continue;
    }
    if (!hasSkillMd(candidate)) {
      continue;
    }
    // Validation happens at load time; invalid children fail fast.
    children.push(loadSkill(candidate));
  }
  return children;
}
