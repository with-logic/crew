/**
 * Dependency resolution helpers for the install set walker (§9 step 6).
 *
 * Given a parsed dep reference plus the parent skill's tap context,
 * decides which tap should own the dep:
 *
 *   - bare-name dep + parent has a tap → look for a sibling skill in
 *     the same tap (so `dependencies: [bar]` from a skill that came
 *     from `core` resolves to `core/bar`, not to `bar` from some other
 *     tap that happens to have the same name).
 *   - bare-name dep + no sibling found → fall through to the cross-tap
 *     search (handled by the caller via `attributeBareName`).
 *   - qualified or path/git ref → handled by the caller via
 *     `attributeRef` from `tap-attribution.ts`.
 *
 * This module's job is just the sibling lookup. If the sibling sits
 * outside the parent's tap root, it is attributed to its own auto tap
 * so state paths remain relative to the tap that owns them.
 */

import { join, posix } from "node:path";
import { CrewError } from "../core/errors.ts";
import { gistSkillStem, isGistTap } from "../core/gist-url.ts";
import { tapClonePath } from "../core/repo-path.ts";
import type { Config, GitSource, LoadedSkill, PathSource, TapConfig } from "../core/types.ts";
import { loadSkill } from "../skill/load.ts";
import { tapRootDir } from "../sources/acquire/index.ts";
import { outOfSourceAt, sourceBoundary } from "../sources/source-boundary.ts";
import { listSourceDir } from "../sources/source-dir.ts";
import { assertCanLookForSkillMd, readSiblingEntry } from "./siblings/disk.ts";
import type { SiblingScan } from "./siblings/index.ts";
import { attributeRef } from "./tap-attribution.ts";

/** Result of finding a dep as a sibling within the parent's tap. */
export interface SiblingHit {
  readonly tap: TapConfig;
  readonly config: Config;
  readonly tapRelativePath: string;
  readonly loaded: LoadedSkill;
}

/**
 * Look for `depName` as a sibling skill of `parentTapPath`. Returns
 * null if not found (the dep walker will try cross-tap resolution next);
 * throws when a sibling named for it can't be loaded (§9 step 6).
 *
 * `parent.exportedPath`, when set, is the parent skill's own location (its
 * directory, or a gist's skill file) inside an already-materialized
 * export of a pinned commit. Siblings must be discovered there, not in
 * the live clone: staging HEAD's bytes while recording the parent's SHA
 * would make state describe a provenance the content doesn't have
 * (§9 step 3). What the walk learns of each sibling comes from
 * `siblings`, read once per resolution.
 */
export function findSiblingDep(
  parent: { tap: TapConfig; tapRelativePath: string; exportedPath?: string | undefined },
  depName: string,
  home: string,
  config: Config,
  siblings: SiblingScan,
): SiblingHit | null {
  if (isWholeRepoRootSkill(parent.tap, parent.tapRelativePath)) return null;
  const tapClone = tapClonePath(parent.tap, home);
  const tapRoot = tapRootDir(tapClone, parent.tap);
  // The parent's own location inside the tap; its siblings share its parent directory.
  const parentPath = parent.exportedPath ?? join(tapRoot, parent.tapRelativePath);
  const siblingParent = join(parentPath, "..");
  const tapBase = parent.tapRelativePath.split("/").slice(0, -1);
  const matches: { entryName: string; siblingPath: string; loaded: LoadedSkill }[] = [];
  const isGist = isGistTap(parent.tap);
  const stem = (entry: string): string => (isGist ? gistSkillStem(entry) : entry);
  const dir = siblings.indexDir(siblingParent, {
    list: () => withDependencyErrors(depName, siblingParent, () => listSourceDir(siblingParent)),
    stem,
    // A gist's files are never folders, so it has no boundary to check.
    readBoundary: () => (isGist ? null : sourceBoundary(parent.tap, home, parentPath)),
    readEntry: (entry, boundary) =>
      readSiblingEntry(parent.tap, join(siblingParent, entry), boundary),
  });
  for (const entryName of dir.candidatesFor(depName)) {
    const siblingPath = join(siblingParent, entryName);
    // §9 step 6: a sibling named for the dependency that crew can't load —
    // can't look into, unreadable, invalid, or a folder leading out of the
    // repository — is the dependency failing, never a miss to look past to
    // other taps; it is loaded whatever it declares. Any other candidate
    // is a skill inside the source declaring the dependency's name.
    if (stem(entryName) === depName) {
      if (!isGist) {
        withDependencyErrors(depName, siblingPath, () => assertCanLookForSkillMd(siblingPath));
      }
      // What the entry is was read when the directory was indexed.
      const sibling = dir.entry(entryName);
      if (!sibling.skill) continue;
      if (dir.boundary !== null && sibling.leadsOut) {
        throw dependencyError(depName, siblingPath, outOfSourceAt(dir.boundary, siblingPath));
      }
    }
    const load = () => siblings.loaded(siblingPath, () => loadSkill(siblingPath));
    const loaded = withDependencyErrors(depName, siblingPath, load);
    if (loaded.frontmatter.name !== depName) continue;
    matches.push({ entryName, siblingPath, loaded });
  }
  if (matches.length === 0) return null;
  if (matches.length > 1) throw duplicateSiblingError(depName, parent.tap.name, matches);

  const match = matches[0]!;
  if (parent.tapRelativePath.length > 0) {
    return {
      tap: parent.tap,
      config,
      tapRelativePath: tapBase.concat([match.entryName]).filter(Boolean).join("/"),
      loaded: match.loaded,
    };
  }

  const attrib = attributeRef(
    siblingRootSource(parent.tap, match.entryName, match.siblingPath),
    config,
  );
  return { tap: attrib.tap, config: attrib.config, tapRelativePath: "", loaded: match.loaded };
}

/**
 * A git repository whose root is the skill has no siblings: beside it is
 * crew's own clone or scratch-export directory, not the source.
 */
export function isWholeRepoRootSkill(tap: TapConfig, tapRelativePath: string): boolean {
  return tap.kind === "git" && tap.subpath === "" && tapRelativePath === "";
}

/** Run `step` on the dependency at `path`, naming the dependency in the `CrewError` it throws. */
function withDependencyErrors<T>(depName: string, path: string, step: () => T): T {
  try {
    return step();
  } catch (err) {
    // Every step throws only `CrewError`: the sibling listing, the look-in
    // check, and `loadSkill`.
    throw dependencyError(depName, path, err as CrewError);
  }
}

/** `ce`, naming the dependency at `path`; the path is added only where the message lacks it. */
function dependencyError(depName: string, path: string, ce: CrewError): CrewError {
  // A refusal naming the folder by its place in the repository needs no path besides.
  const named = ce.message.includes(path) || ce.details["path"] === path;
  const where = named ? "" : ` (\`${path}\`)`;
  const message = `dependency \`${depName}\`${where}: ${ce.message}`;
  return new CrewError(ce.code, message, { path, ...ce.details, dependency: depName }, ce.remedy);
}

function siblingRootSource(
  tap: TapConfig,
  entryName: string,
  siblingPath: string,
): GitSource | PathSource {
  if (tap.kind === "path") return { type: "path", path: siblingPath };
  const base = tap.subpath === "" ? "" : posix.dirname(tap.subpath);
  const subpath = base === "" || base === "." ? entryName : `${base}/${entryName}`;
  return { type: "git", url: tap.url, ref: null, subpath };
}

function duplicateSiblingError(
  depName: string,
  tapName: string,
  matches: readonly { entryName: string }[],
): CrewError {
  const paths = matches.map((m) => m.entryName).join(", ");
  return new CrewError(
    "conflicting_dependencies",
    `dependency \`${depName}\` appears multiple times near tap \`${tapName}\` at ${paths}`,
    { name: depName, tap: tapName, paths: matches.map((m) => m.entryName) },
  );
}
