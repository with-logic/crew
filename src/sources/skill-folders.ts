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
 */

import { join } from "node:path";
import { hasSkillMd } from "../skill/load.ts";
import { isDirectory, listDir } from "../util/fs.ts";
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
    if (hasSkillMd(child) || leadsOutOfSource(boundary, child)) found.push(child);
    // Exactly one level of namespace; other folders (docs, scripts) hold none.
    else found.push(...skillChildren(child));
  }
  return found;
}

/** The folders directly in `dir` that hold a `SKILL.md`. */
function skillChildren(dir: string): string[] {
  const found: string[] = [];
  for (const name of listDir(dir)) {
    const child = join(dir, name);
    if (isDirectory(child) && hasSkillMd(child)) found.push(child);
  }
  return found;
}
