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
import { tapPath } from "../core/paths.ts";
import type { Config, GitSource, LoadedSkill, PathSource, TapConfig } from "../core/types.ts";
import { hasSkillMd, loadSkill, loadSkillName } from "../skill/load.ts";
import { tapRootDir } from "../sources/acquire/index.ts";
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
 */
export function findSiblingDep(
  parent: { tap: TapConfig; tapRelativePath: string },
  depName: string,
  home: string,
  config: Config,
): SiblingHit | null {
  const tapClone = parent.tap.kind === "git" ? tapPath(parent.tap.name, home) : parent.tap.path;
  const tapRoot = tapRootDir(tapClone, parent.tap);
  if (parent.tap.kind === "git" && parent.tap.subpath === "" && parent.tapRelativePath === "") {
    return null;
  }
  // The parent's own directory inside the tap.
  const parentDir = join(tapRoot, parent.tapRelativePath);
  const siblingParent = join(parentDir, "..");
  const tapBase = parent.tapRelativePath.split("/").slice(0, -1);
  const matches: { dirName: string; siblingDir: string; loaded: LoadedSkill }[] = [];
  for (const dirName of listDir(siblingParent)) {
    const siblingDir = join(siblingParent, dirName);
    if (!(isDirectory(siblingDir) && hasSkillMd(siblingDir))) continue;
    if (siblingName(siblingDir) !== depName) continue;
    const loaded = loadSkill(siblingDir);
    matches.push({ dirName, siblingDir, loaded });
  }
  if (matches.length === 0) return null;
  if (matches.length > 1) throw duplicateSiblingError(depName, parent.tap.name, matches);

  const match = matches[0]!;
  if (parent.tapRelativePath.length > 0) {
    return {
      tap: parent.tap,
      config,
      tapRelativePath: tapBase.concat([match.dirName]).filter(Boolean).join("/"),
      loaded: match.loaded,
    };
  }

  const attrib = attributeRef(
    siblingRootSource(parent.tap, match.dirName, match.siblingDir),
    config,
  );
  return { tap: attrib.tap, config: attrib.config, tapRelativePath: "", loaded: match.loaded };
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
  dirName: string,
  siblingDir: string,
): GitSource | PathSource {
  if (tap.kind === "path") return { type: "path", path: siblingDir };
  const base = tap.subpath === "" ? "" : posix.dirname(tap.subpath);
  const subpath = base === "" || base === "." ? dirName : `${base}/${dirName}`;
  return { type: "git", url: tap.url, ref: null, subpath };
}

function duplicateSiblingError(
  depName: string,
  tapName: string,
  matches: readonly { dirName: string }[],
): CrewError {
  const paths = matches.map((m) => m.dirName).join(", ");
  return new CrewError(
    "conflicting_dependencies",
    `dependency \`${depName}\` appears multiple times near tap \`${tapName}\` at ${paths}`,
    { name: depName, tap: tapName, paths: matches.map((m) => m.dirName) },
  );
}
