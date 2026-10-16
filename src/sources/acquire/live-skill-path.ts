/**
 * Locating one skill inside a live (unexported) tap checkout (§10.1).
 */

import { realpathSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { CrewError } from "../../core/errors.ts";
import type { TapConfig } from "../../core/types.ts";
import { exists } from "../../util/fs.ts";

/**
 * Where an installed skill now lives in a live checkout: `rootDir` joined
 * with the skill's tap-relative path — its directory, or a gist's skill
 * file. A path that no longer exists is `no_skills_found`, which
 * `crew update` reports as the soft `source_gone` (§10.1) rather than
 * failing to load a skill that isn't there.
 *
 * In a git tap the location must also still resolve inside the clone
 * (§8.4): upstream can replace a skill with a link out of the repository
 * after it was installed, and following it would read content that was
 * never part of the source. A link that stays inside the repository is
 * followed, as discovery follows it at install. A path tap is the user's
 * own directory and, like its root (`tapRootDir`), isn't held to that.
 */
export function liveSkillPath(
  tap: Pick<TapConfig, "kind">,
  rootDir: string,
  tapRelativePath: string,
): string {
  const location = join(rootDir, tapRelativePath);
  if (!exists(location)) {
    throw new CrewError("no_skills_found", `\`${tapRelativePath}\` no longer exists in the tap`, {
      path: tapRelativePath,
    });
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
