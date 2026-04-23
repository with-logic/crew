/**
 * Directory expansion (§9 step 5).
 *
 * Three cases, checked in order:
 *   1. Root `SKILL.md` → one skill.
 *   2. Root `skills/` subdirectory present → walk under `skills/`:
 *      - Each immediate child with a `SKILL.md` is a skill.
 *      - Each immediate child WITHOUT a `SKILL.md` but containing
 *        child directories that do is a NAMESPACE — every child of
 *        that namespace that has a `SKILL.md` is a skill.
 *      - Exactly one level of namespace nesting. Deeper is ignored.
 *      - The source root itself is not walked in this case.
 *   3. Otherwise → walk ONE level under the source root.
 *
 * A location that produces zero valid skills aborts with
 * `no_skills_found`.
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
  const children = isDirectory(skillsDir)
    ? collectWithNamespaces(skillsDir)
    : collectSkillChildren(rootDir);
  if (children.length === 0) {
    throw new CrewError(
      "no_skills_found",
      `no valid skills found at \`${rootDir}\` — expected a SKILL.md there, subdirectories that each contain one, or a \`skills/\` directory of either`,
      { path: rootDir },
    );
  }
  return children;
}

/**
 * Walk `skills/` one level deep, descending into namespace dirs
 * (children that lack a `SKILL.md` but contain child skill dirs).
 */
function collectWithNamespaces(skillsDir: string): LoadedSkill[] {
  const children: LoadedSkill[] = [];
  for (const name of listDir(skillsDir)) {
    const candidate = join(skillsDir, name);
    if (!isDirectory(candidate)) {
      continue;
    }
    if (hasSkillMd(candidate)) {
      children.push(loadSkill(candidate));
      continue;
    }
    // `candidate` has no SKILL.md — treat as a namespace if at least
    // one grandchild has a SKILL.md. Non-namespace dirs under
    // `skills/` (e.g. docs, scripts) are silently ignored.
    for (const member of collectSkillChildren(candidate)) {
      children.push(member);
    }
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
