/**
 * Resolving an installed skill's recorded path in a tap's clone without
 * leaving the repository, for `crew update` (§8.4, §10.1).
 */

import { readlinkSync, realpathSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { CrewError } from "../../core/errors.ts";
import { isGoneError } from "../../util/errno.ts";
import { climbsOut } from "../../util/relative-path.ts";
import { noLongerASkillError, unreadableError } from "./skill-shape.ts";

/**
 * The real path of `path`; throws unless it is inside `clone`, already a
 * real path. Missing — deleted, or a dangling or looping link — is gone.
 * A link crew can't resolve is judged by where it points: out of the
 * repository it is never read; inside, the failure is a local one.
 */
export function resolveInside(clone: string, path: string, tapRelativePath: string): string {
  let resolved: string;
  try {
    resolved = realpathSync(path);
  } catch (err) {
    if (isGoneError(err)) throw noLongerASkillError(tapRelativePath);
    if (linksOut(clone, path)) throw outsideRepoError(tapRelativePath);
    throw unreadableError(path, err);
  }
  if (climbsOut(relative(clone, resolved))) throw outsideRepoError(tapRelativePath);
  return resolved;
}

/**
 * True when a link on the way to `at` — `at` itself, or a folder above
 * it — points out of `clone`. It walks up only while the path won't
 * resolve; from there up, the real path settled where it leads.
 */
function linksOut(clone: string, at: string): boolean {
  const target = linkTarget(at);
  if (target !== null && climbsOut(relative(clone, target))) return true;
  return !resolves(at) && linksOut(clone, dirname(at));
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

function outsideRepoError(tapRelativePath: string): CrewError {
  return new CrewError(
    "invalid_ref",
    `\`${tapRelativePath || "."}\` now leads outside the repository through a symlink, so crew won't read it`,
    { path: tapRelativePath },
  );
}
