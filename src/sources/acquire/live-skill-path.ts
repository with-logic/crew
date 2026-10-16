/**
 * Locating one skill inside a live (unexported) tap checkout (§10.1).
 */

import { realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { CrewError } from "../../core/errors.ts";
import type { TapConfig } from "../../core/types.ts";
import { isSkillFile } from "../../skill/skill-file.ts";
import { isGistTap } from "../gist.ts";

/**
 * Where an installed skill now lives in a live checkout: `rootDir` joined
 * with the skill's tap-relative path — its directory, or a gist's skill
 * file. A path that no longer exists, and a gist file that is no longer a
 * regular file (a symlink is never a gist skill, §9 step 5), are
 * `no_skills_found`, which `crew update` reports as the soft
 * `source_gone` (§10.1) rather than failing to load a skill that isn't
 * there. Any other failure to look — a permission error, say — is left
 * to fail the update, not mistaken for an upstream deletion.
 *
 * In a git tap the location must also still resolve inside the clone
 * (§8.4): upstream can replace a skill with a link out of the repository
 * after it was installed, and following it would read content that was
 * never part of the source. A link that stays inside the repository is
 * followed, as discovery follows skill-directory links at install. A
 * path tap is the user's own directory and, like its root
 * (`tapRootDir`), isn't held to that.
 * The escape is `invalid_ref`, which `crew update` also reports as the
 * soft `source_gone`.
 */
export function liveSkillPath(
  tap: Pick<TapConfig, "kind" | "url">,
  rootDir: string,
  tapRelativePath: string,
): string {
  const location = join(rootDir, tapRelativePath);
  const gistFileGone = isGistTap(tap) && tapRelativePath !== "" && !isSkillFile(location);
  if (isGone(location) || gistFileGone) {
    throw new CrewError(
      "no_skills_found",
      `\`${tapRelativePath}\` is no longer a skill in the tap`,
      { path: tapRelativePath },
    );
  }
  if (tap.kind === "git") {
    const inside = relative(realpathSync(rootDir), realpathSync(location));
    if (inside.startsWith("..") || isAbsolute(inside)) {
      throw new CrewError(
        "invalid_ref",
        `\`${tapRelativePath}\` now leads outside the repository through a symlink, so crew won't read it`,
        { path: tapRelativePath },
      );
    }
  }
  return location;
}

/** True when nothing is at `path` any more — a dangling link included. Other errors throw. */
function isGone(path: string): boolean {
  try {
    statSync(path);
    return false;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return true;
    throw err;
  }
}
