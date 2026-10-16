/**
 * Locating one installed skill again for `crew update` (§10.1): in a live
 * (unexported) tap checkout, with `assertSkillMdInside` for a commit's
 * export too. Whether it is still a skill is `./skill-shape.ts`.
 */

import { realpathSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { CrewError } from "../../core/errors.ts";
import { isGistTap } from "../../core/gist-url.ts";
import { tapClonePath } from "../../core/repo-path.ts";
import type { TapConfig } from "../../core/types.ts";
import { isLink, resolveInside } from "./resolve-inside.ts";
import {
  assertStillASkill,
  isMissingPathError,
  noLongerASkill,
  unreadable,
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
 * held to the containment check. In every tap, the skill's `SKILL.md` is
 * held to `assertSkillMdInside`.
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
    const resolved = resolveInside(clone, location, tapRelativePath, outsideRepo);
    const belowRoot = tapRelativePath !== "" || tap.subpath !== "";
    if (belowRoot && isCloneMetadata(relative(clone, resolved))) {
      throw intoCloneMetadata(tapRelativePath);
    }
  } else if (isGone(location)) {
    throw noLongerASkill(tapRelativePath);
  }
  assertSkillMdInside(tap, location, tapRelativePath);
  assertStillASkill(tap, location, tapRelativePath);
  return location;
}

/**
 * A folder skill's `SKILL.md` may be a link only to a file inside the
 * skill's own folder (§9 step 4): crew copies a link as a link, so one
 * leading anywhere else would leave the installed skill without a
 * `SKILL.md`. One that does now is gone, and is never read. At an
 * `@<ref>` the folder is the skill's scratch export. A gist's files are
 * already judged without following links.
 */
export function assertSkillMdInside(
  tap: Pick<TapConfig, "kind" | "url">,
  location: string,
  tapRelativePath: string,
): void {
  if (isGistTap(tap)) return;
  const skillMd = join(location, "SKILL.md");
  if (isLink(skillMd)) {
    resolveInside(realpathSync(location), skillMd, tapRelativePath, outsideSkill);
  }
}

/** The clone root itself (`""` from it), or anything in its `.git`. */
function isCloneMetadata(fromClone: string): boolean {
  return fromClone === "" || fromClone.split(sep)[0] === ".git";
}

function intoCloneMetadata(tapRelativePath: string): CrewError {
  return new CrewError(
    "invalid_ref",
    `\`${tapRelativePath || "."}\` now leads to the repository's root or its \`.git\` through a symlink, so crew won't read it`,
    { path: tapRelativePath },
  );
}

function outsideRepo(tapRelativePath: string): CrewError {
  return new CrewError(
    "invalid_ref",
    `\`${tapRelativePath || "."}\` now leads outside the repository through a symlink, so crew won't read it`,
    { path: tapRelativePath },
  );
}

function outsideSkill(tapRelativePath: string): CrewError {
  return new CrewError(
    "invalid_ref",
    `the SKILL.md of \`${tapRelativePath || "."}\` now links outside the skill's folder, so crew won't read it`,
    { path: tapRelativePath },
  );
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
    if (isMissingPathError(err)) return true;
    throw unreadable(path, err);
  }
}
