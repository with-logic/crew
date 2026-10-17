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
 * or search-render time. A candidate whose name it can't read isn't
 * indexed, but is listed in `unloadable`, so re-expansion can report it
 * (§10.1.1 step 2).
 *
 * Namespace rules (§9 step 5 case 2): a namespace is a directory
 * directly under `skills/` that contains no `SKILL.md` of its own
 * but contains child directories with a `SKILL.md`.
 *
 * A gist (§9 step 5, "Gists") has no directories: its index is the
 * skill files at its root, each located by its file name. In any other
 * git tap, a folder that leads out of the repository through a link is
 * never read (§9 step 5, "Folder links"): it is listed in `unloadable`
 * with that refusal.
 */

import { basename, relative } from "node:path";
import type { CrewError } from "../core/errors.ts";
import { tapClonePath } from "../core/repo-path.ts";
import type { TapConfig } from "../core/types.ts";
import { ensureClone } from "../git/repo/index.ts";
import { tapRootDir } from "../sources/acquire/index.ts";
import {
  type DiscoveryMode,
  discoveryOf,
  fallsBackToRecursive,
  isRootSkill,
} from "../sources/expand.ts";
import { gistSkillCandidates } from "../sources/gist.ts";
import { migrateTapClone } from "../sources/migrate-clones.ts";
import { findRecursiveSkillDirs } from "../sources/recursive.ts";
import { standardSkillFolders } from "../sources/skill-folders.ts";
import { leadsOutOfSource, outOfSourceError, sourceBoundary } from "../sources/source-boundary.ts";
import { toPosix } from "../util/fs.ts";
import {
  type LoadFailures,
  nameOrFailure,
  type UnloadableCandidate,
  unloadableAt,
} from "./unloadable-candidates.ts";

/** Location of one skill inside a tap. */
export interface SkillLocation {
  /** Declared skill name from SKILL.md. */
  readonly name: string;
  /** Namespace the skill lives under, or null if at skills/ root or tap root. */
  readonly namespace: string | null;
  /** Absolute path to the skill's directory (or, in a gist, its file) on disk. */
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
  /** Candidates whose name couldn't be read, so aren't in `skills`. */
  readonly unloadable: readonly UnloadableCandidate[];
}

/** What the walk itself finds: the index but for the candidates it couldn't name. */
type IndexedSkills = Omit<TapIndex, "unloadable">;

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
  const failures: LoadFailures = new Map();
  const found = walkTap(tap, home, root, failures);
  return { ...found, unloadable: unloadableAt(root, failures) };
}

/** The walk behind `indexTap`, recording in `failures` each candidate it can't name. */
function walkTap(
  tap: TapConfig,
  home: string,
  root: string,
  failures: LoadFailures,
): IndexedSkills {
  const skillNameForIndex = (path: string): string | null => nameOrFailure(path, failures);
  const refuse = (path: string, err: CrewError): void => {
    failures.set(path, { code: err.code, message: err.message });
  };
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

  const mode = discoveryOf(tap);
  if (isRootSkill(root, mode)) {
    const skillName = skillNameForIndex(root);
    if (skillName !== null)
      addSkill({ name: skillName, namespace: null, path: root, tapRelativePath: "" });
    return { skills, namespaces };
  }

  if (mode === "gist") {
    for (const path of gistSkillCandidates(root)) {
      const skillName = skillNameForIndex(path);
      if (skillName === null) continue;
      addSkill({ name: skillName, namespace: null, path, tapRelativePath: basename(path) });
    }
    return { skills, namespaces };
  }

  // Cases 2–3, the same candidates install finds. §9 step 5 "Folder
  // links": one leading out of the repository is never listed or read —
  // a candidate refused unnamed, which re-expansion reports (C-SPEC-17).
  const boundary = sourceBoundary(tap, home, root);
  for (const folder of standardSkillFolders(root, boundary)) {
    const tapRelativePath = toPosix(relative(root, folder));
    if (leadsOutOfSource(boundary, folder)) {
      refuse(folder, outOfSourceError(folder));
      continue;
    }
    const skillName = skillNameForIndex(folder);
    if (skillName === null) continue;
    // `skills/<namespace>/<skill>` is the one layout with a namespace.
    const parts = tapRelativePath.split("/");
    const namespace = parts.length === 3 ? parts[1]! : null;
    addSkill({ name: skillName, namespace, path: folder, tapRelativePath });
  }
  return maybeRecursiveIndex(mode, root, { skills, namespaces }, addSkill, skillNameForIndex);
}

function maybeRecursiveIndex(
  mode: DiscoveryMode,
  root: string,
  found: IndexedSkills,
  addSkill: (loc: SkillLocation) => void,
  skillNameForIndex: (path: string) => string | null,
): IndexedSkills {
  // The walk follows no link, so every folder it finds is inside `root`.
  if (found.skills.size > 0 || !fallsBackToRecursive(mode)) return found;
  for (const dir of findRecursiveSkillDirs(root)) {
    const tapRelativePath = toPosix(relative(root, dir));
    const skillName = skillNameForIndex(dir);
    if (skillName === null) continue;
    addSkill({ name: skillName, namespace: null, path: dir, tapRelativePath });
  }
  return found;
}
