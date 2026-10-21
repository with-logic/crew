/**
 * Load a skill from disk (§9 step 4, §16): read its `SKILL.md`, parse and validate
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
import { readSourceFrontmatter, readSourceText } from "../sources/read.ts";
import { exists } from "../util/fs.ts";
import { extractFrontmatter } from "./frontmatter.ts";
import { validateFrontmatter, validateFrontmatterName } from "./validate.ts";

/** Load and validate a skill; unreadable bytes are operational failures (§9, §13). */
export function loadSkill(path: string): LoadedSkill {
  const skillMdPath = join(path, "SKILL.md");
  assertManifestIsNotSymlink(skillMdPath, path);
  const raw = readSourceText(skillMdPath);
  const { data } = extractFrontmatter(raw);
  const frontmatter = validateFrontmatter(data);
  return { path, frontmatter, skillMd: raw };
}

/** Load only the declared skill name from `SKILL.md`, for tap indexing. */
export function loadSkillName(path: string): string {
  const skillMdPath = join(path, "SKILL.md");
  assertManifestIsNotSymlink(skillMdPath, path);
  return validateFrontmatterName(readSourceFrontmatter(skillMdPath));
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
