/**
 * Resolving a path in a tap without leaving a boundary (§8.4, §10.1):
 * for `crew update`, the repository a skill was installed from, or the
 * skill's own folder for its `SKILL.md`.
 */

import { lstatSync, readlinkSync, realpathSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import type { CrewError } from "../../core/errors.ts";
import { climbsOut } from "../../util/relative-path.ts";
import { isMissingPathError, noLongerASkill, unreadable } from "./skill-shape.ts";

/**
 * The real path of `path`; throws `escaped` unless it is inside
 * `boundary`, already a real path: the clone, or the skill's own folder.
 * Missing — deleted, or a dangling or looping link — is gone. A link crew
 * can't resolve is judged by where it points: outside the boundary it is
 * never read; inside, the failure is a local one.
 */
export function resolveInside(
  boundary: string,
  path: string,
  tapRelativePath: string,
  escaped: (tapRelativePath: string) => CrewError,
): string {
  let resolved: string;
  try {
    resolved = realpathSync(path);
  } catch (err) {
    if (isMissingPathError(err) || (err as NodeJS.ErrnoException).code === "ELOOP") {
      throw noLongerASkill(tapRelativePath);
    }
    if (linksOut(boundary, path)) throw escaped(tapRelativePath);
    throw unreadable(path, err);
  }
  if (climbsOut(relative(boundary, resolved))) throw escaped(tapRelativePath);
  return resolved;
}

/**
 * True when a link on the way to `path` — `path` itself, or a folder
 * above it — points out of `boundary`. It walks up only while the path
 * won't resolve; from there up, the real path settled where it leads.
 */
function linksOut(boundary: string, at: string): boolean {
  const target = linkTarget(at);
  if (target !== null && climbsOut(relative(boundary, target))) return true;
  return !resolves(at) && linksOut(boundary, dirname(at));
}

function resolves(path: string): boolean {
  try {
    realpathSync(path);
    return true;
  } catch {
    return false;
  }
}

/** Where the link at `path` points, from its real parent directory; null when it isn't a readable link. */
function linkTarget(path: string): string | null {
  try {
    return resolve(realpathSync(dirname(path)), readlinkSync(path));
  } catch {
    return null;
  }
}

/** True when `path` is itself a symlink; false when it isn't, or can't be looked at. */
export function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}
