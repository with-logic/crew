/**
 * Locating one skill inside a live (unexported) tap checkout (§10.1).
 */

import { join } from "node:path";
import { CrewError } from "../../core/errors.ts";
import type { TapConfig } from "../../core/types.ts";
import { exists } from "../../util/fs.ts";
import { assertNoSymlinkEscape } from "../../util/symlink-containment.ts";

/**
 * A skill's location in a live checkout, held to what the pinned branch
 * gets from `withExportedTree`. In a git tap the recorded path must not
 * lead through a symlink (§8.4): upstream can replace a skill with a
 * link out of the clone after it was installed. A path tap is the
 * user's own directory and, like its root (`tapRootDir`), isn't held to
 * that. Either way a path that no longer exists is `no_skills_found` —
 * which `crew update` reports as the soft `source_gone` (§10.1) rather
 * than failing to load a skill that isn't there.
 */
export function liveSkillPath(
  tap: Pick<TapConfig, "kind">,
  rootDir: string,
  skillPath: string,
): string {
  const location = join(rootDir, skillPath);
  if (tap.kind === "git") assertNoSymlinkEscape(rootDir, location, `skill \`${skillPath}\``);
  if (!exists(location)) {
    throw new CrewError("no_skills_found", `\`${skillPath}\` no longer exists in the tap`, {
      skillPath,
    });
  }
  return location;
}
