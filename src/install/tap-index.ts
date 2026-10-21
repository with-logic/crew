/**
 * Shallow index of a single tap's layout — just what we need for
 * reference resolution (§8.3). Directory layouts read only the declared
 * `name` from SKILL.md; gist layouts fully validate candidate frontmatter.
 *
 * Given a tap, produces:
 *   - `skills`: every declared skill name findable under the tap (root,
 *     skills/<name>, skills/<namespace>/<name>, or original top-level gist filenames).
 *   - `namespaces`: every namespace name and its skill children.
 *
 * Directory indexing is intentionally optimistic: full SKILL.md validation
 * still happens at install or search-render time. Invalid gist files are
 * excluded during candidate discovery (§9 step 5).
 *
 * Namespace rules (§9 step 5 case 2): a namespace is a directory
 * directly under `skills/` that contains no `SKILL.md` of its own
 * but contains child directories with a `SKILL.md`.
 */

import { join } from "node:path";
import { tapClonePath } from "../core/repo-path.ts";
import type { SkillFrontmatter, TapConfig } from "../core/types.ts";
import { ensureClone } from "../git/repo/index.ts";
import { hasSkillMd, loadSkillName } from "../skill/load.ts";
import { tapRootDir } from "../sources/acquire/index.ts";
import { gistCandidates, isGistTap } from "../sources/gist.ts";
import { migrateTapClone } from "../sources/migrate-clones.ts";
import { sourceRelativePath } from "../sources/path.ts";
import { isSourceDirectory, listSourceDirectory } from "../sources/read.ts";
import { findRecursiveSkillDirs } from "../sources/recursive.ts";
import { isSourceReadFailure } from "../util/source-read.ts";

/** Location of one skill inside a tap. */
export interface SkillLocation {
  /** Declared skill name from SKILL.md. */
  readonly name: string;
  /** Validated gist frontmatter, retained without the source body (§9 step 5). */
  readonly frontmatter?: SkillFrontmatter;
  /** Namespace the skill lives under, or null if at skills/ root or tap root. */
  readonly namespace: string | null;
  /** Absolute path to the skill directory or original gist file on disk. */
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
    migrateTapClone(tap, home);
    const tp = tapClonePath(tap, home);
    ensureClone(tap.url, tp);
    return tapRootDir(tp, tap);
  }
  return tap.path;
}

/**
 * Build a shallow index of a tap. Returns empty maps only for a tap
 * that turns out to have no valid skills.
 *
 * `rootOverride` points the index at an already-materialized directory
 * instead of the live clone. A ref-carrying reference needs this: the
 * skill it names may have been deleted at HEAD, so indexing the clone
 * would fail to find something that exists perfectly well at the
 * requested commit (§9 step 3).
 */
export function indexTap(tap: TapConfig, home: string, rootOverride?: string): TapIndex {
  const root = rootOverride ?? tapRoot(tap, home);
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

  const followSymlinks = tap.kind === "path";
  if (!isSourceDirectory(root, followSymlinks)) return { skills, namespaces };
  if (isGistTap(tap)) {
    for (const candidate of gistCandidates(root))
      addSkill({
        name: candidate.frontmatter.name,
        frontmatter: candidate.frontmatter,
        namespace: null,
        path: candidate.path,
        tapRelativePath: candidate.filename,
      });
    return { skills, namespaces };
  }
  if (hasSkillMd(root)) {
    const skillName = skillNameForIndex(root);
    if (skillName !== null)
      addSkill({ name: skillName, namespace: null, path: root, tapRelativePath: "" });
    return { skills, namespaces };
  }

  const skillsDir = join(root, "skills");
  if (isSourceDirectory(skillsDir, followSymlinks)) {
    // Case 2: walk under skills/
    for (const name of listSourceDirectory(skillsDir)) {
      const child = join(skillsDir, name);
      if (!isSourceDirectory(child, followSymlinks)) continue;
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
      for (const childName of listSourceDirectory(child)) {
        const grandchild = join(child, childName);
        if (!isSourceDirectory(grandchild, followSymlinks)) continue;
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
    return maybeRecursiveIndex(tap, root, skills, namespaces, addSkill);
  }

  // Case 3: walk one level under root.
  for (const name of listSourceDirectory(root)) {
    const child = join(root, name);
    if (!isSourceDirectory(child, followSymlinks)) continue;
    if (!hasSkillMd(child)) continue;
    const skillName = skillNameForIndex(child);
    if (skillName === null) continue;
    addSkill({ name: skillName, namespace: null, path: child, tapRelativePath: name });
  }
  return maybeRecursiveIndex(tap, root, skills, namespaces, addSkill);
}

function maybeRecursiveIndex(
  tap: TapConfig,
  root: string,
  skills: Map<string, SkillLocation[]>,
  namespaces: Map<string, SkillLocation[]>,
  addSkill: (loc: SkillLocation) => void,
): TapIndex {
  if (skills.size > 0 || tap.discovery !== "recursive") return { skills, namespaces };
  for (const dir of findRecursiveSkillDirs(root)) {
    const tapRelativePath = sourceRelativePath(root, dir);
    const skillName = skillNameForIndex(dir);
    if (skillName === null) continue;
    addSkill({ name: skillName, namespace: null, path: dir, tapRelativePath });
  }
  return { skills, namespaces };
}

function skillNameForIndex(path: string): string | null {
  try {
    return loadSkillName(path);
  } catch (err) {
    if (isSourceReadFailure(err)) throw err;
    return null;
  }
}
