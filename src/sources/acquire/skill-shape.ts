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
import { errnoReason } from "../../util/errno.ts";
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
    if (isMissingPathError(err) || (err as NodeJS.ErrnoException).code === "ELOOP") return true;
    throw unreadable(skillMd, err);
  }
}

export function noLongerASkill(tapRelativePath: string): CrewError {
  return new CrewError(
    "no_skills_found",
    `\`${tapRelativePath || "."}\` is no longer a skill in the tap`,
    { path: tapRelativePath },
  );
}

/** Nothing at the path, or a path through something that isn't a folder. */
export function isMissingPathError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
}

export function unreadable(path: string, err: unknown): CrewError {
  return new CrewError(
    "source_unreachable",
    `couldn't look at \`${path}\` — ${errnoReason(err)}`,
    { path },
    UNREADABLE_REMEDY,
  );
}
