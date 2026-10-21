/**
 * Load a skill from disk (§9 step 4): read its `SKILL.md` or gist file, parse and validate
 * frontmatter, and return a structured `LoadedSkill`.
 *
 * `loadSkill` is the boundary between raw filesystem state and validated
 * domain objects. Every code path that wants to install, describe, or hash
 * a skill goes through here first (§9 step 4).
 */

import { lstatSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../core/errors.ts";
import type { LoadedSkill } from "../core/types.ts";
import { exists, readText } from "../util/fs.ts";
import { extractFrontmatter } from "./frontmatter.ts";
import { validateFrontmatter, validateFrontmatterName } from "./validate.ts";

/** Load and validate a directory or explicit gist file (§9 steps 4–5). */
export function loadSkill(path: string, file = false): LoadedSkill {
  // §9 step 5: a recorded gist filename must never become a directory skill.
  if (file) {
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (stat === undefined) {
      throw new CrewError("no_skills_found", `gist skill \`${path}\` no longer exists`, { path });
    }
    if (!stat.isFile()) {
      throw new CrewError("invalid_skill", `gist skill \`${path}\` must be a regular file`, {
        path,
      });
    }
  }
  const skillMdPath = file ? path : join(path, "SKILL.md");
  if (!file) assertManifestIsNotSymlink(skillMdPath, path);
  const raw = readText(skillMdPath);
  const { data } = extractFrontmatter(raw);
  const frontmatter = validateFrontmatter(data);
  return { path, frontmatter, skillMd: raw };
}

/** Load only the declared skill name from `SKILL.md`, for tap indexing. */
export function loadSkillName(path: string): string {
  const skillMdPath = join(path, "SKILL.md");
  assertManifestIsNotSymlink(skillMdPath, path);
  const raw = readText(skillMdPath);
  const { data } = extractFrontmatter(raw);
  return validateFrontmatterName(data);
}

/** True iff `path` contains a `SKILL.md`. Does not validate. */
export function hasSkillMd(path: string): boolean {
  return exists(join(path, "SKILL.md"));
}

/** Require a manifest at the expected path; reject every symlink, including internal links (§9 step 4). */
function assertManifestIsNotSymlink(manifestPath: string, skillDirectory: string): void {
  const manifest = lstatSync(manifestPath, { throwIfNoEntry: false });
  if (!manifest) {
    throw new CrewError(
      "invalid_skill",
      `no SKILL.md in \`${skillDirectory}\` — every skill directory needs one`,
      { path: skillDirectory },
    );
  }
  if (!manifest.isSymbolicLink()) return;
  throw new CrewError(
    "invalid_skill",
    `SKILL.md in \`${skillDirectory}\` must not be a symbolic link`,
    { path: skillDirectory },
  );
}
