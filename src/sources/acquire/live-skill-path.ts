/**
 * Locating one skill inside a live (unexported) tap checkout (§10.1).
 */

import { realpathSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { CrewError } from "../../core/errors.ts";
import { tapClonePath } from "../../core/repo-path.ts";
import type { TapConfig } from "../../core/types.ts";
import { UNREADABLE_REMEDY } from "../../skill/load.ts";
import { isSkillFile } from "../../skill/skill-file.ts";
import { isDirectory } from "../../util/fs.ts";
import { climbsOut } from "../../util/symlink-containment.ts";
import { isGistTap, isOneSkillGist } from "../gist.ts";

/**
 * Where an installed skill now lives in a live checkout: `rootDir` joined
 * with the skill's tap-relative path — its directory, or a gist's skill
 * file. A path that no longer exists, a gist file that is no longer a
 * regular file (a symlink is never a gist skill, §9 step 5), and a folder
 * skill that is no longer a folder are `no_skills_found`, which
 * `crew update` reports as the soft `source_gone` (§10.1) rather than
 * failing to load a skill that isn't there. Any other failure to look — a
 * permission error, say — is `source_unreachable`, failing the update
 * rather than being mistaken for an upstream deletion.
 *
 * In a git tap the location must also still resolve inside the clone
 * (§8.4): upstream can replace a skill with a link out of the repository
 * after it was installed, and following it would read content that was
 * never part of the source; the escape is `invalid_ref`, which
 * `crew update` also reports as the soft `source_gone`. A link that stays
 * inside the repository is followed, as discovery follows skill-directory
 * links at install. A path tap is the user's own directory and, like its
 * root (`tapRootDir`), isn't held to any of this.
 */
export function liveSkillPath(
  tap: TapConfig,
  home: string,
  rootDir: string,
  tapRelativePath: string,
): string {
  const location = join(rootDir, tapRelativePath);
  if (isGone(location)) throw noLongerASkill(tapRelativePath);
  assertStillASkill(tap, location, tapRelativePath);
  if (tap.kind === "git") {
    // Measured against the repository, not the tap's subpath: a link from
    // `skills/foo` to `../shared/foo` is still inside the source.
    const inside = relative(realpathSync(tapClonePath(tap, home)), realpathSync(location));
    if (climbsOut(inside)) {
      throw new CrewError(
        "invalid_ref",
        `\`${tapRelativePath}\` now leads outside the repository through a symlink, so crew won't read it`,
        { path: tapRelativePath },
      );
    }
  }
  return location;
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
    throw new CrewError(
      "source_unreachable",
      `couldn't look at \`${path}\` — ${(err as Error).message}`,
      { path },
      UNREADABLE_REMEDY,
    );
  }
}

/**
 * Throw `no_skills_found` when the skill at `location` — live, or in a
 * commit's export — is now the wrong kind of thing: a gist skill file
 * that isn't a regular file, a one-skill gist whose root `SKILL.md` isn't
 * (a symlink is never part of a gist skill, §9 step 5), or a folder skill
 * that isn't a folder.
 */
export function assertStillASkill(
  tap: Pick<TapConfig, "kind" | "url">,
  location: string,
  tapRelativePath: string,
): void {
  const stillASkill = isGistTap(tap)
    ? tapRelativePath === ""
      ? isOneSkillGist(location)
      : isSkillFile(location)
    : tapRelativePath === "" || isDirectory(location);
  if (!stillASkill) throw noLongerASkill(tapRelativePath);
}

function noLongerASkill(tapRelativePath: string): CrewError {
  return new CrewError(
    "no_skills_found",
    `\`${tapRelativePath || "."}\` is no longer a skill in the tap`,
    { path: tapRelativePath },
  );
}
