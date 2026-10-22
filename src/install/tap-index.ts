/**
 * Tap layout indexing for reference resolution (§8.3, §9 step 5).
 * Directory indexing reads declared names optimistically, retaining invalid
 * manifests separately; gist discovery fully validates literal top-level files.
 * Namespaces are immediate skills/ children without their own SKILL.md.
 * Excluded Git links contribute only to the caller's aggregate warning.
 */

import { join } from "node:path";
import { CrewError } from "../core/errors.ts";
import { tapClonePath } from "../core/repo-path.ts";
import type { SkillFrontmatter, TapConfig } from "../core/types.ts";
import { ensureClone } from "../git/repo/index.ts";
import { hasSkillMd, loadSkillName } from "../skill/load.ts";
import { tapRootDir } from "../sources/acquire/index.ts";
import type { GitDiscoveryWarnings } from "../sources/discovery.ts";
import type { SkippedSkill } from "../sources/expand.ts";
import { gistCandidates, isGistTap } from "../sources/gist.ts";
import { migrateTapClone } from "../sources/migrate-clones.ts";
import { sourceRelativePath } from "../sources/path.ts";
import { isSourceDirectory, listSourceDirectory } from "../sources/read.ts";
import { findRecursiveSkillDirs } from "../sources/recursive.ts";

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

/** Rejected directory candidate; its declared name cannot be trusted (§9 step 4). */
export interface RejectedTapSkill extends SkippedSkill {
  readonly code: "invalid_skill";
}

type DirectorySkillInput = Pick<SkillLocation, "path" | "namespace" | "tapRelativePath">;

/** Result of indexing a tap. */
export interface TapIndex {
  /** Every skill location, keyed by skill name. Multiple values when a name repeats across namespaces. */
  readonly skills: ReadonlyMap<string, readonly SkillLocation[]>;
  /** Namespace name → its skill children. */
  readonly namespaces: ReadonlyMap<string, readonly SkillLocation[]>;
  readonly skipped: readonly RejectedTapSkill[];
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
 * Build a shallow index of a tap, retaining rejected directory candidates
 * separately from valid declared-name matches.
 *
 * `rootOverride` points the index at an already-materialized directory
 * instead of the live clone. A ref-carrying reference needs this: the
 * skill it names may have been deleted at HEAD, so indexing the clone
 * would fail to find something that exists perfectly well at the
 * requested commit (§9 step 3).
 */
export function indexTap(
  tap: TapConfig,
  home: string,
  rootOverride?: string,
  discovery?: GitDiscoveryWarnings,
): TapIndex {
  const root = rootOverride ?? tapRoot(tap, home);
  const skills = new Map<string, SkillLocation[]>();
  const namespaces = new Map<string, SkillLocation[]>();
  const skipped: RejectedTapSkill[] = [];

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

  const addDirectorySkill = ({ path, namespace, tapRelativePath }: DirectorySkillInput): void => {
    try {
      addSkill({ name: loadSkillName(path), namespace, path, tapRelativePath });
    } catch (err) {
      if (!(err instanceof CrewError) || err.code !== "invalid_skill") throw err;
      skipped.push({ path, code: err.code, message: err.message });
    }
  };

  const followSymlinks = tap.kind === "path";
  if (!isSourceDirectory(root, followSymlinks)) return { skills, namespaces, skipped };
  if (isGistTap(tap)) {
    for (const candidate of gistCandidates(root))
      addSkill({
        name: candidate.frontmatter.name,
        frontmatter: candidate.frontmatter,
        namespace: null,
        path: candidate.path,
        tapRelativePath: candidate.filename,
      });
    return { skills, namespaces, skipped };
  }
  if (hasSkillMd(root)) {
    addDirectorySkill({ path: root, namespace: null, tapRelativePath: "" });
    return { skills, namespaces, skipped };
  }

  const skillsDir = join(root, "skills");
  if (isSourceDirectory(skillsDir, followSymlinks, discovery)) {
    // Case 2: walk under skills/
    for (const name of listSourceDirectory(skillsDir)) {
      const child = join(skillsDir, name);
      if (!isSourceDirectory(child, followSymlinks, discovery)) continue;
      if (hasSkillMd(child)) {
        addDirectorySkill({ path: child, namespace: null, tapRelativePath: `skills/${name}` });
        continue;
      }
      // Possibly a namespace: look at its children.
      for (const childName of listSourceDirectory(child)) {
        const grandchild = join(child, childName);
        if (!isSourceDirectory(grandchild, followSymlinks, discovery)) continue;
        if (!hasSkillMd(grandchild)) continue;
        addDirectorySkill({
          path: grandchild,
          namespace: name,
          tapRelativePath: `skills/${name}/${childName}`,
        });
      }
    }
    return maybeRecursiveIndex({
      tap,
      root,
      index: { skills, namespaces, skipped },
      addDirectorySkill,
      discovery: followSymlinks ? undefined : discovery,
    });
  }

  // Case 3: walk one level under root.
  for (const name of listSourceDirectory(root)) {
    const child = join(root, name);
    if (!isSourceDirectory(child, followSymlinks, discovery)) continue;
    if (!hasSkillMd(child)) continue;
    addDirectorySkill({ path: child, namespace: null, tapRelativePath: name });
  }
  return maybeRecursiveIndex({
    tap,
    root,
    index: { skills, namespaces, skipped },
    addDirectorySkill,
    discovery: followSymlinks ? undefined : discovery,
  });
}

function maybeRecursiveIndex({
  tap,
  root,
  index,
  addDirectorySkill,
  discovery,
}: {
  readonly tap: TapConfig;
  readonly root: string;
  readonly index: TapIndex;
  readonly addDirectorySkill: (input: DirectorySkillInput) => void;
  readonly discovery: GitDiscoveryWarnings | undefined;
}): TapIndex {
  // §9 step 5.4: invalid standard candidates also prevent recursive fallback.
  if (index.skills.size > 0 || index.skipped.length > 0 || tap.discovery !== "recursive")
    return index;
  for (const dir of findRecursiveSkillDirs(root, discovery)) {
    const tapRelativePath = sourceRelativePath(root, dir);
    addDirectorySkill({ path: dir, namespace: null, tapRelativePath });
  }
  return index;
}
