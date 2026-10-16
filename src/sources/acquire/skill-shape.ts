/**
 * Whether an installed skill is still a skill where it was recorded, for
 * `crew update` (§9 step 5, §10.1) — in a live checkout or a commit's
 * export — and the faults found while looking.
 */

import { statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { CrewError } from "../../core/errors.ts";
import { isGistTap } from "../../core/gist-url.ts";
import type { TapConfig } from "../../core/types.ts";
import { assertSkillMdLinkAllowed } from "../../skill/skill-md-link.ts";
import { isGoneError, unreadablePathError } from "../../util/errno.ts";
import { isDirectory } from "../../util/fs.ts";
import { isExactSkillFile, isOneSkillGist } from "../gist.ts";

/**
 * Throw `no_skills_found` when the skill at `location` — live, or in a
 * commit's export — is now the wrong kind of thing: a gist skill file
 * that isn't a regular file, a one-skill gist whose root `SKILL.md` isn't
 * (a symlink is never a gist skill file or root SKILL.md, §9 step 5), or a
 * folder skill that isn't a folder or no longer holds a `SKILL.md`.
 */
export function assertStillASkill(
  tap: Pick<TapConfig, "kind" | "url">,
  location: string,
  tapRelativePath: string,
): void {
  if (!stillASkill(tap, location, tapRelativePath)) throw noLongerASkillError(tapRelativePath);
}

/**
 * A folder skill's `SKILL.md` is held to §9 step 4 on update as at
 * install: one reached through a link crew won't follow is a hard
 * `invalid_skill`, checked before anything looks through the link. At an
 * `@<ref>` the folder is the skill's scratch export. A gist's files —
 * and a one-skill gist's root `SKILL.md` — are judged without following
 * links instead (`assertStillASkill`).
 */
export function assertFolderSkillMdLink(
  tap: Pick<TapConfig, "kind" | "url">,
  location: string,
  tapRelativePath: string,
): void {
  if (!isGistTap(tap)) assertSkillMdLinkAllowed(location, tapRelativePath || ".");
}

function stillASkill(
  tap: Pick<TapConfig, "kind" | "url">,
  location: string,
  tapRelativePath: string,
): boolean {
  if (isGistTap(tap)) {
    if (tapRelativePath === "") return isOneSkillGist(location);
    // Named exactly, case included (§9 step 5): on a case-insensitive
    // filesystem `prd.md` would otherwise still find an upstream `PRD.md`.
    return isExactSkillFile(dirname(location), basename(location));
  }
  // A whole-tap root skill's directory is the tap root, which acquisition
  // already proved exists as a directory. Either way it must still hold a
  // SKILL.md — a deleted one and a link to nowhere alike.
  return (tapRelativePath === "" || isDirectory(location)) && !skillMdGone(location);
}

/**
 * True when the folder skill at `location` no longer has a `SKILL.md`:
 * deleted, or a dangling or looping link. Any other failure to look — a
 * folder crew can't read — is a local fault, not an upstream deletion.
 */
function skillMdGone(location: string): boolean {
  return isGone(join(location, "SKILL.md"));
}

/**
 * True when nothing is at `path` any more — a dangling or looping link
 * included. Any other failure to look is the local filesystem's,
 * reported as such.
 */
export function isGone(path: string): boolean {
  try {
    statSync(path);
    return false;
  } catch (err) {
    if (isGoneError(err)) return true;
    throw unreadablePathError(path, err);
  }
}

export function noLongerASkillError(tapRelativePath: string): CrewError {
  return new CrewError(
    "no_skills_found",
    `\`${tapRelativePath || "."}\` is no longer a skill in the tap`,
    { path: tapRelativePath },
  );
}
