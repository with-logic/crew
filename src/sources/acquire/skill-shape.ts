/**
 * Whether an installed skill is still a skill where it was recorded, for
 * `crew update` (§9 step 5, §10.1) — in a live checkout or a commit's
 * export — and the faults found while looking.
 */

import { statSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../../core/errors.ts";
import { isGistTap } from "../../core/gist-url.ts";
import type { TapConfig } from "../../core/types.ts";
import { UNREADABLE_REMEDY } from "../../skill/load.ts";
import { isSkillFile } from "../../skill/skill-file.ts";
import { skillMdLinksOut, skillMdOutsideError } from "../../skill/skill-md-link.ts";
import { errnoReason, isGoneError } from "../../util/errno.ts";
import { isDirectory } from "../../util/fs.ts";
import { isOneSkillGist } from "../gist.ts";

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
 * A folder skill's `SKILL.md` that links out of the skill's folder is
 * `invalid_skill`, as at install (§9 step 4): a hard failure, checked
 * before anything looks through the link. At an `@<ref>` the folder is
 * the skill's scratch export. A gist's files are never links.
 */
export function assertSkillMdInside(
  tap: Pick<TapConfig, "kind" | "url">,
  location: string,
  tapRelativePath: string,
): void {
  if (isGistTap(tap)) return;
  let out: boolean;
  try {
    out = skillMdLinksOut(location);
  } catch (err) {
    throw unreadableError(join(location, "SKILL.md"), err);
  }
  if (out) throw skillMdOutsideError(location, tapRelativePath || ".");
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
  const skillMd = join(location, "SKILL.md");
  try {
    statSync(skillMd);
    return false;
  } catch (err) {
    if (isGoneError(err)) return true;
    throw unreadableError(skillMd, err);
  }
}

export function noLongerASkillError(tapRelativePath: string): CrewError {
  return new CrewError(
    "no_skills_found",
    `\`${tapRelativePath || "."}\` is no longer a skill in the tap`,
    { path: tapRelativePath },
  );
}

export function unreadableError(path: string, err: unknown): CrewError {
  return new CrewError(
    "source_unreachable",
    `couldn't look at \`${path}\` — ${errnoReason(err)}`,
    { path },
    UNREADABLE_REMEDY,
  );
}
