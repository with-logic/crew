/**
 * Locating one installed skill again for `crew update` (§10.1): in a live
 * (unexported) tap checkout, with `assertExportedSkillMdInside` for a
 * commit's export. Whether it is still a skill is `./skill-shape.ts`.
 */

import { lstatSync, readlinkSync, realpathSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { CrewError } from "../../core/errors.ts";
import { isGistTap } from "../../core/gist-url.ts";
import { tapClonePath } from "../../core/repo-path.ts";
import type { TapConfig } from "../../core/types.ts";
import { climbsOut } from "../../util/relative-path.ts";
import {
  assertStillASkill,
  isMissingPathError,
  noLongerASkill,
  unreadable,
} from "./skill-shape.ts";

/**
 * Where an installed skill now lives in a live checkout: `rootDir` joined
 * with the skill's tap-relative path — its directory, or a gist's skill
 * file. A skill that is no longer there — gone, or now the wrong kind of
 * thing (`assertStillASkill`) — is `no_skills_found`, which `crew update`
 * reports as the soft `source_gone` (§10.1) rather than failing to load
 * a skill that isn't there. Any other failure to look — a permission
 * error, say — is `source_unreachable`, failing the update rather than
 * being mistaken for an upstream deletion.
 *
 * In a git tap the skill, and its own `SKILL.md`, must also still resolve
 * inside the clone (§8.4): upstream can replace either with a link out of
 * the repository after it was installed, and following it would read
 * content that was never part of the source. That escape is `invalid_ref`,
 * also reported as `source_gone`; so is a link that dangles or loops, or
 * one crew can't resolve that points out of the repository. One crew
 * can't resolve that points inside is a local fault (`source_unreachable`).
 * A link that stays inside the repository is followed, as discovery
 * follows skill-directory links at install — but never, for a skill below
 * the root, to the clone itself or into its `.git`, which hold crew's
 * clone metadata (a remote URL with a token, say), not the source. A path
 * tap is the user's own directory and, like its root (`tapRootDir`),
 * isn't held to the containment check.
 */
export function liveSkillPath(
  tap: TapConfig,
  home: string,
  rootDir: string,
  tapRelativePath: string,
): string {
  const location = join(rootDir, tapRelativePath);
  // A gist skill file is judged without following links (§9 step 5).
  if (isGistTap(tap) && tapRelativePath !== "") {
    assertStillASkill(tap, location, tapRelativePath);
    return location;
  }
  if (tap.kind === "git") {
    // Measured against the repository, not the tap's subpath: a link from
    // `skills/foo` to `../shared/foo` is still inside the source.
    const clone = realpathSync(tapClonePath(tap, home));
    const resolved = resolveInside(clone, location, tapRelativePath);
    const belowRoot = tapRelativePath !== "" || tap.subpath !== "";
    if (belowRoot && isCloneMetadata(relative(clone, resolved))) {
      throw intoCloneMetadata(tapRelativePath);
    }
    const skillMd = join(location, "SKILL.md");
    if (isLink(skillMd)) resolveInside(clone, skillMd, tapRelativePath);
  } else if (isGone(location)) {
    throw noLongerASkill(tapRelativePath);
  }
  assertStillASkill(tap, location, tapRelativePath);
  return location;
}

/**
 * At an `@<ref>`, a folder skill's `SKILL.md` is held to the same rule
 * against the skill's own scratch export (§9 step 3): a link out of it is
 * never read. A gist's files are already judged without following links.
 */
export function assertExportedSkillMdInside(
  tap: Pick<TapConfig, "kind" | "url">,
  location: string,
  tapRelativePath: string,
): void {
  if (isGistTap(tap)) return;
  const skillMd = join(location, "SKILL.md");
  if (isLink(skillMd)) resolveInside(realpathSync(location), skillMd, tapRelativePath);
}

/**
 * The real path of `path`; throws unless it is inside `boundary`, already
 * a real path: the clone live, or the skill's own export at a ref. Missing
 * — deleted, or a dangling or looping link — is gone. A link crew can't
 * resolve is judged by where it points: outside the boundary it is never
 * read; inside, the failure is a local one.
 */
function resolveInside(boundary: string, path: string, tapRelativePath: string): string {
  let resolved: string;
  try {
    resolved = realpathSync(path);
  } catch (err) {
    if (isMissingPathError(err) || (err as NodeJS.ErrnoException).code === "ELOOP") {
      throw noLongerASkill(tapRelativePath);
    }
    if (linksOut(boundary, path)) throw outsideRepo(tapRelativePath);
    throw unreadable(path, err);
  }
  if (climbsOut(relative(boundary, resolved))) throw outsideRepo(tapRelativePath);
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

/** The clone root itself (`""` from it), or anything in its `.git`. */
function isCloneMetadata(fromClone: string): boolean {
  return fromClone === "" || fromClone.split(sep)[0] === ".git";
}

function intoCloneMetadata(tapRelativePath: string): CrewError {
  return new CrewError(
    "invalid_ref",
    `\`${tapRelativePath || "."}\` now leads to the repository's root or its \`.git\` through a symlink, so crew won't read it`,
    { path: tapRelativePath },
  );
}

function outsideRepo(tapRelativePath: string): CrewError {
  return new CrewError(
    "invalid_ref",
    `\`${tapRelativePath || "."}\` now leads outside the repository through a symlink, so crew won't read it`,
    { path: tapRelativePath },
  );
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
function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * True when nothing is at `path` any more — a dangling link included. Any
 * other failure to look is the local filesystem's, reported as such.
 */
function isGone(path: string): boolean {
  try {
    statSync(path);
    return false;
  } catch (err) {
    if (isMissingPathError(err)) return true;
    throw unreadable(path, err);
  }
}
