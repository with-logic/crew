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
 * it can't be read (§9 step 4). At the root, a folder crew can't list
 * holds no `SKILL.md` it can see, so it is passed over. A `skills/` folder
 * or root crew can't list — or a `skills/` it can list but not look into —
 * is `source_unreachable` (`./source-dir.ts`).
 */

import { join } from "node:path";
import { hasSkillMd } from "../skill/load.ts";
import { canList, isDirectory } from "../util/fs.ts";
import { isRefusedSourceFolder, type SourceBoundary } from "./source-boundary.ts";
import { assertSourceDirSearchable, isSourceDir, listSourceDir } from "./source-dir.ts";

/** The candidate skill folders under `root`, in walk order. */
export function standardSkillFolders(root: string, boundary: SourceBoundary): string[] {
  const skillsDir = join(root, "skills");
  // A `skills/` crew can't look at is no reason to walk the root instead.
  if (!isSourceDir(skillsDir)) return skillChildren(root);
  if (isRefusedSourceFolder(boundary, skillsDir)) return [skillsDir];
  const names = listSourceDir(skillsDir);
  // Listed but not searchable, every child would read as no folder.
  assertSourceDirSearchable(skillsDir);
  const found: string[] = [];
  for (const name of names) {
    const child = join(skillsDir, name);
    if (!isDirectory(child)) continue;
    // A namespace is listed only once it is known to stay inside.
    if (mayHoldSkill(child) || isRefusedSourceFolder(boundary, child)) found.push(child);
    // Exactly one level of namespace; other folders (docs, scripts) hold none.
    else found.push(...skillChildren(child, mayHoldSkill));
  }
  return found;
}

/** Below `skills/`: a folder holding a `SKILL.md`, or one crew can't list that might. */
function mayHoldSkill(folder: string): boolean {
  return hasSkillMd(folder) || !canList(folder);
}

/** The folders directly in `dir` that `isSkill` accepts — by default, those holding a `SKILL.md`. */
function skillChildren(dir: string, isSkill: (folder: string) => boolean = hasSkillMd): string[] {
  const found: string[] = [];
  for (const name of listSourceDir(dir)) {
    const child = join(dir, name);
    if (isDirectory(child) && isSkill(child)) found.push(child);
  }
  return found;
}
