/**
 * Acquire one installed skill for `crew update` (§10.1): in the live
 * checkout, or in a scratch export of just its subtree at a ref.
 */

import { posix } from "node:path";
import { CrewError } from "../../core/errors.ts";
import { isGistSkillFileName, isGistTap } from "../../core/gist-url.ts";
import type { TapConfig } from "../../core/types.ts";
import { withExportedTree } from "../../git/export.ts";
import { type AcquiredTap, acquireTap, resolveTapRef } from "./index.ts";
import { liveSkillPath } from "./live-skill-path.ts";
import {
  assertFolderSkillMdLinkAllowed,
  assertStillASkill,
  noLongerASkillError,
} from "./skill-shape.ts";

/**
 * Acquire only ONE skill's subtree of a tap at `ref`.
 *
 * `crew update` reads exactly `<tap root>/<entry source path>` per entry.
 * For a whole-repo tap (`subpath` empty) the general `withAcquiredTap`
 * would export the entire repository for each such entry — N full
 * exports for N skills sharing a tap and ref. Narrowing the export to
 * the skill's own path makes that cost proportional to what is read
 * (§10.1).
 *
 * `fn` receives the skill's own location — its directory, or a gist's
 * skill file — not the tap root. A skill that is no longer there, or no
 * longer a skill, is `no_skills_found` or `invalid_ref` (§10.1); a
 * `SKILL.md` that links out of its folder is `invalid_skill`, and a path
 * crew can't look at `source_unreachable`.
 */
export function withAcquiredSkill<T>(
  tap: TapConfig,
  ref: string | null,
  tapRelativePath: string,
  home: string,
  fn: (acquired: Pick<AcquiredTap, "resolvedSha" | "pinned">, skillPath: string) => T,
): T {
  // A gist skill is one top-level file: a recorded path that isn't — a
  // hand-edited or repaired `../x.md` — is never read (§10.1).
  if (isGistTap(tap) && tapRelativePath !== "" && !isGistSkillFileName(tapRelativePath)) {
    throw noLongerASkillError(tapRelativePath);
  }
  if (ref === null || tap.kind === "path") {
    const acquired = acquireTap(tap, home);
    return fn(acquired, liveSkillPath(tap, home, acquired.rootDir, tapRelativePath));
  }
  const { clonePath, sha, pinned } = resolveTapRef(tap, ref, home);
  const exportPath =
    tapRelativePath.length === 0
      ? tap.subpath
      : tap.subpath.length > 0
        ? posix.join(tap.subpath, tapRelativePath)
        : tapRelativePath;
  let exported = false;
  try {
    return withExportedTree(clonePath, sha, exportPath, home, (skillPath) => {
      exported = true;
      // The link check first: `assertStillASkill` looks through the link.
      assertFolderSkillMdLinkAllowed(tap, skillPath, tapRelativePath);
      assertStillASkill(tap, skillPath, tapRelativePath);
      return fn({ resolvedSha: sha, pinned }, skillPath);
    });
  } catch (err) {
    // §10.1: the export refuses a recorded path reached through a symlink
    // (its only `invalid_skill`, §9 step 3); at a ref, that skill is gone.
    if (!exported && err instanceof CrewError && err.code === "invalid_skill") {
      throw noLongerASkillError(tapRelativePath);
    }
    throw err;
  }
}
