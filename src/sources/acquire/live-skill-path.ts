/**
 * Locating one installed skill again for `crew update` (§10.1) in a live
 * (unexported) tap checkout. Whether it is still a skill — there, or in a
 * commit's export — is `./skill-shape.ts`.
 */

import { realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { CrewError } from "../../core/errors.ts";
import { isGistTap } from "../../core/gist-url.ts";
import { tapClonePath } from "../../core/repo-path.ts";
import type { TapConfig } from "../../core/types.ts";
import { resolveInside } from "./resolve-inside.ts";
import {
  assertFolderSkillMdLinkAllowed,
  assertStillASkill,
  isGone,
  noLongerASkillError,
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
 * In a git tap the skill must also still resolve inside the clone (§8.4):
 * upstream can replace it with a link out of the repository after it was
 * installed, and following it would read content that was never part of
 * the source. That escape is `invalid_ref`, also reported as
 * `source_gone`; so is a link that dangles or loops, or one crew can't
 * resolve that points out of the repository. One crew can't resolve that
 * points inside is a local fault (`source_unreachable`). A link that
 * stays inside the repository is followed, as discovery follows
 * skill-directory links at install — but never, for a skill below the
 * root, to the clone itself or into its `.git`, which hold crew's clone
 * metadata (a remote URL with a token, say), not the source. A path tap
 * is the user's own directory and, like its root (`tapRootDir`), isn't
 * held to the containment check. In every tap but a gist, the skill's
 * `SKILL.md` is held to `assertFolderSkillMdLinkAllowed` first.
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
      throw cloneMetadataError(tapRelativePath);
    }
  } else if (isGone(location)) {
    throw noLongerASkillError(tapRelativePath);
  }
  assertFolderSkillMdLinkAllowed(tap, location, tapRelativePath);
  assertStillASkill(tap, location, tapRelativePath);
  return location;
}

/** The clone root itself (`""` from it), or anything in its `.git`. */
function isCloneMetadata(fromClone: string): boolean {
  return fromClone === "" || fromClone.split(sep)[0] === ".git";
}

function cloneMetadataError(tapRelativePath: string): CrewError {
  return new CrewError(
    "invalid_ref",
    `\`${tapRelativePath || "."}\` now leads to the repository's root or its \`.git\` through a symlink, so crew won't read it`,
    { path: tapRelativePath },
  );
}
