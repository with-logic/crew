/**
 * The candidate skill folders of a source's standard layout (§9 step 5
 * cases 2–3): every child of `skills/` holding a `SKILL.md`, and every
 * such child of a namespace there — or, with no `skills/`, every such
 * child of the root.
 *
 * In a git source, a folder that leads out of the repository through a
 * link (`./source-boundary.ts`) — `skills/` itself, a namespace, or a
 * skill's own folder — is a candidate as it stands, never listed, so the
 * loader refuses it before reading anything in it; at the root, only one
 * holding a `SKILL.md` is (whether it does is all crew looks at).
 *
 * Below `skills/`, the source's index of skills, a folder crew can't list
 * might hold a skill, so it is a candidate too, and the loader reports why
 * it can't be read (§9 step 4); at the root, one holds none crew can see.
 * A `skills/` folder or root crew can't list is `source_unreachable`.
 */

import { join } from "node:path";
import { hasSkillMd } from "../skill/load.ts";
import { canList, isDirectory, listDir } from "../util/fs.ts";
import { leadsOutOfSource, type SourceBoundary } from "./source-boundary.ts";

/** The candidate skill folders under `root`, in walk order. */
export function standardSkillFolders(root: string, boundary: SourceBoundary): string[] {
  const skillsDir = join(root, "skills");
  if (!isDirectory(skillsDir)) return skillChildren(root);
  if (leadsOutOfSource(boundary, skillsDir)) return [skillsDir];
  const found: string[] = [];
  for (const name of listDir(skillsDir)) {
    const child = join(skillsDir, name);
    if (!isDirectory(child)) continue;
    // A namespace is listed only once it is known to stay inside.
    if (indexedSkill(child) || leadsOutOfSource(boundary, child)) found.push(child);
    // Exactly one level of namespace; other folders (docs, scripts) hold none.
    else found.push(...skillChildren(child, indexedSkill));
  }
  return found;
}

/** Below `skills/`: a folder holding a `SKILL.md`, or one crew can't list that might. */
function indexedSkill(folder: string): boolean {
  return hasSkillMd(folder) || !canList(folder);
}

/** The folders directly in `dir` that `isSkill` accepts — by default, those holding a `SKILL.md`. */
function skillChildren(dir: string, isSkill: (folder: string) => boolean = hasSkillMd): string[] {
  const found: string[] = [];
  for (const name of listDir(dir)) {
    const child = join(dir, name);
    if (isDirectory(child) && isSkill(child)) found.push(child);
  }
  return found;
}
