/**
 * Shallow index of a single tap's layout — just what we need for
 * reference resolution (§8.3). It reads only each skill's declared
 * `name` from SKILL.md; full validation happens later in the install
 * flow.
 *
 * Given a tap, produces:
 *   - `skills`: every declared skill name findable under the tap (root,
 *     skills/<name>, or skills/<namespace>/<name>).
 *   - `namespaces`: every namespace name and its skill children.
 *
 * The index is intentionally optimistic: it validates only the
 * declared `name`; full SKILL.md validation still happens at install
 * or search-render time.
 *
 * Namespace rules (§9 step 5 case 2): a namespace is a directory
 * directly under `skills/` that contains no `SKILL.md` of its own
 * but contains child directories with a `SKILL.md`.
 */

import { join } from "node:path";
import { tapPath } from "../core/paths.ts";
import type { TapConfig } from "../core/types.ts";
import { ensureClone } from "../git/repo.ts";
import { hasSkillMd, loadSkillName } from "../skill/load.ts";
import { tapRootDir } from "../sources/acquire/index.ts";
import { isDirectory, listDir } from "../util/fs.ts";

/** Location of one skill inside a tap. */
export interface SkillLocation {
  /** Declared skill name from SKILL.md. */
  readonly name: string;
  /** Namespace the skill lives under, or null if at skills/ root or tap root. */
  readonly namespace: string | null;
  /** Absolute path to the skill's directory on disk. */
  readonly path: string;
  /**
   * Path RELATIVE to the tap root, POSIX-style. Empty when the skill
   * IS the tap root (a whole-repo single-skill tap).
   */
  readonly tapRelativePath: string;
}

/** Result of indexing a tap. */
export interface TapIndex {
  /** Every skill location, keyed by skill name. Multiple values when a name repeats across namespaces. */
  readonly skills: ReadonlyMap<string, readonly SkillLocation[]>;
  /** Namespace name → its skill children. */
  readonly namespaces: ReadonlyMap<string, readonly SkillLocation[]>;
}

/** Resolve a tap's on-disk root, materializing a git clone if needed. */
export function tapRoot(tap: TapConfig, home: string): string {
  if (tap.kind === "git") {
    const tp = tapPath(tap.name, home);
    ensureClone(tap.url, tp);
    return tapRootDir(tp, tap);
  }
  return tap.path;
}

/**
 * Build a shallow index of a tap. Returns empty maps for a tap that
 * turns out to have no valid skills (including the single-root-skill
 * case, which the resolver handles as a whole-tap install).
 */
export function indexTap(tap: TapConfig, home: string): TapIndex {
  const root = tapRoot(tap, home);
  const skills = new Map<string, SkillLocation[]>();
  const namespaces = new Map<string, SkillLocation[]>();

  const addSkill = (loc: SkillLocation): void => {
    const list = skills.get(loc.name);
    if (list) list.push(loc);
    else skills.set(loc.name, [loc]);
    if (loc.namespace !== null) {
      const ns = namespaces.get(loc.namespace);
      if (ns) ns.push(loc);
      else namespaces.set(loc.namespace, [loc]);
    }
  };

  // Case 1: root is itself a skill.
  if (hasSkillMd(root)) {
    // Tap resolution handles this as a whole-tap install; per-name
    // lookup is unused for a root-skill tap.
    return { skills, namespaces };
  }

  const skillsDir = join(root, "skills");
  if (isDirectory(skillsDir)) {
    // Case 2: walk under skills/
    for (const name of listDir(skillsDir)) {
      const child = join(skillsDir, name);
      if (!isDirectory(child)) continue;
      if (hasSkillMd(child)) {
        const skillName = skillNameForIndex(child);
        if (skillName === null) continue;
        addSkill({
          name: skillName,
          namespace: null,
          path: child,
          tapRelativePath: `skills/${name}`,
        });
        continue;
      }
      // Possibly a namespace: look at its children.
      for (const childName of listDir(child)) {
        const grandchild = join(child, childName);
        if (!isDirectory(grandchild)) continue;
        if (!hasSkillMd(grandchild)) continue;
        const skillName = skillNameForIndex(grandchild);
        if (skillName === null) continue;
        addSkill({
          name: skillName,
          namespace: name,
          path: grandchild,
          tapRelativePath: `skills/${name}/${childName}`,
        });
      }
    }
    return { skills, namespaces };
  }

  // Case 3: walk one level under root.
  for (const name of listDir(root)) {
    const child = join(root, name);
    if (!isDirectory(child)) continue;
    if (!hasSkillMd(child)) continue;
    const skillName = skillNameForIndex(child);
    if (skillName === null) continue;
    addSkill({ name: skillName, namespace: null, path: child, tapRelativePath: name });
  }
  return { skills, namespaces };
}

function skillNameForIndex(path: string): string | null {
  try {
    return loadSkillName(path);
  } catch {
    return null;
  }
}
