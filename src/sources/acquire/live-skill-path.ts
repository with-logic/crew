/**
 * Locating one installed skill again for `crew update` (§10.1): in a live
 * (unexported) tap checkout, and — `assertStillASkill` — in a commit's
 * export too.
 */

import { lstatSync, realpathSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { CrewError } from "../../core/errors.ts";
import { tapClonePath } from "../../core/repo-path.ts";
import type { TapConfig } from "../../core/types.ts";
import { UNREADABLE_REMEDY } from "../../skill/load.ts";
import { isSkillFile } from "../../skill/skill-file.ts";
import { errnoReason } from "../../util/errno.ts";
import { isDirectory } from "../../util/fs.ts";
import { climbsOut } from "../../util/relative-path.ts";
import { isGistTap, isOneSkillGist } from "../gist.ts";

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
 * also reported as `source_gone`; so is a link crew can't follow at all
 * (dangling, looping, or into somewhere unreadable). A link that stays
 * inside the repository is followed, as discovery follows skill-directory
 * links at install. A path tap is the user's own directory and, like its
 * root (`tapRootDir`), isn't held to the containment check.
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
    assertResolvesInside(clone, location, tapRelativePath);
    const skillMd = join(location, "SKILL.md");
    if (isLink(skillMd)) assertResolvesInside(clone, skillMd, tapRelativePath);
  } else if (isGone(location)) {
    throw noLongerASkill(tapRelativePath);
  }
  assertStillASkill(tap, location, tapRelativePath);
  return location;
}

/** Throw unless `path` resolves to somewhere inside `clone` (already a real path). */
function assertResolvesInside(clone: string, path: string, tapRelativePath: string): void {
  let resolved: string;
  try {
    resolved = realpathSync(path);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR" || isLink(path))
      throw noLongerASkill(tapRelativePath);
    throw unreadable(path, err);
  }
  if (climbsOut(relative(clone, resolved))) {
    throw new CrewError(
      "invalid_ref",
      `\`${tapRelativePath || "."}\` now leads outside the repository through a symlink, so crew won't read it`,
      { path: tapRelativePath },
    );
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
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return true;
    throw unreadable(path, err);
  }
}

function unreadable(path: string, err: unknown): CrewError {
  return new CrewError(
    "source_unreachable",
    `couldn't look at \`${path}\` — ${errnoReason(err)}`,
    { path },
    UNREADABLE_REMEDY,
  );
}

/**
 * Throw `no_skills_found` when the skill at `location` — live, or in a
 * commit's export — is now the wrong kind of thing: a gist skill file
 * that isn't a regular file, a one-skill gist whose root `SKILL.md` isn't
 * (a symlink is never a gist skill file or root SKILL.md, §9 step 5), or a
 * folder skill that isn't a folder.
 */
export function assertStillASkill(
  tap: Pick<TapConfig, "kind" | "url">,
  location: string,
  tapRelativePath: string,
): void {
  if (!stillASkill(tap, location, tapRelativePath)) throw noLongerASkill(tapRelativePath);
}

function stillASkill(
  tap: Pick<TapConfig, "kind" | "url">,
  location: string,
  tapRelativePath: string,
): boolean {
  if (isGistTap(tap)) {
    return tapRelativePath === "" ? isOneSkillGist(location) : isSkillFile(location);
  }
  // A whole-tap root skill's directory is the tap root, which acquisition
  // already proved exists as a directory.
  return tapRelativePath === "" || isDirectory(location);
}

function noLongerASkill(tapRelativePath: string): CrewError {
  return new CrewError(
    "no_skills_found",
    `\`${tapRelativePath || "."}\` is no longer a skill in the tap`,
    { path: tapRelativePath },
  );
}
