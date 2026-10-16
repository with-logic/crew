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
import { tapClonePath } from "../core/repo-path.ts";
import type { Config, GitSource, LoadedSkill, PathSource, TapConfig } from "../core/types.ts";
import { hasSkillMd, loadSkill, loadSkillName } from "../skill/load.ts";
import { tapRootDir } from "../sources/acquire/index.ts";
import { isGistSkillCandidate, isGistTap } from "../sources/gist.ts";
import { isDirectory, listDir } from "../util/fs.ts";
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
 * null if not found (the dep walker will try cross-tap resolution next).
 *
 * `parent.parentPath`, when set, is the parent skill's own location (its
 * directory, or a gist's skill file) inside an already-materialized
 * export of a pinned commit. Siblings must be discovered there, not in
 * the live clone: staging HEAD's bytes while recording the parent's SHA
 * would make state describe a provenance the content doesn't have
 * (§9 step 3).
 */
export function findSiblingDep(
  parent: { tap: TapConfig; tapRelativePath: string; parentPath?: string | undefined },
  depName: string,
  home: string,
  config: Config,
): SiblingHit | null {
  if (isWholeRepoRootSkill(parent.tap, parent.tapRelativePath)) return null;
  const tapClone = tapClonePath(parent.tap, home);
  const tapRoot = tapRootDir(tapClone, parent.tap);
  // The parent's own location inside the tap; its siblings share its parent directory.
  const parentPath = parent.parentPath ?? join(tapRoot, parent.tapRelativePath);
  const siblingParent = join(parentPath, "..");
  const tapBase = parent.tapRelativePath.split("/").slice(0, -1);
  const matches: { entryName: string; siblingPath: string; loaded: LoadedSkill }[] = [];
  for (const entryName of listDir(siblingParent)) {
    const siblingPath = join(siblingParent, entryName);
    if (!isSiblingSkill(parent.tap, siblingPath)) continue;
    if (siblingName(siblingPath) !== depName) continue;
    const loaded = loadSkill(siblingPath);
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

/** A sibling is a skill directory — or, in a gist, a skill file (§9 step 5). */
function isSiblingSkill(tap: TapConfig, path: string): boolean {
  if (isGistTap(tap)) return isGistSkillCandidate(path);
  return isDirectory(path) && hasSkillMd(path);
}

function siblingName(path: string): string | null {
  try {
    return loadSkillName(path);
  } catch {
    return null;
  }
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
