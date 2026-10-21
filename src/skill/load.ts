/**
 * Load a skill from disk (§9 step 4, §16): read its directory `SKILL.md` or original gist
 * filename, parse and validate frontmatter, and return a structured `LoadedSkill`.
 * Gist source filenames are preserved here; staging installs their bytes as `SKILL.md`.
 *
 * `loadSkill` retains raw content for callers that need it; `loadSkillMetadata`
 * validates selected gist files without retaining bodies. Discovery supplies
 * validated gist frontmatter directly (§9 steps 4–5).
 */

import { lstatSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../core/errors.ts";
import type { LoadedSkill, SkillMetadata } from "../core/types.ts";
import { exists, readText } from "../util/fs.ts";
import { readSourceFile } from "../util/source-read.ts";
import { assertSkillFile } from "./file.ts";
import { extractFrontmatter } from "./frontmatter.ts";
import { readFrontmatter } from "./read-frontmatter.ts";
import { validateFrontmatter, validateFrontmatterName } from "./validate.ts";

/** Load and validate a skill; unreadable bytes are operational failures (§9, §13). */
export function loadSkill(path: string, isGistFile = false): LoadedSkill {
  const skillMdPath = isGistFile ? path : join(path, "SKILL.md");
  if (isGistFile) assertSkillFile(path);
  else assertManifestIsNotSymlink(skillMdPath, path);
  const raw = readSourceFile(skillMdPath, readText);
  const { data } = extractFrontmatter(raw);
  const frontmatter = validateFrontmatter(data);
  return { path, frontmatter, skillMd: raw };
}

/** Validate selected gist metadata without reading its body; directory loading is unchanged (§9). */
export function loadSkillMetadata(path: string, isGistFile = false): SkillMetadata {
  if (!isGistFile) return loadSkill(path);
  assertSkillFile(path);
  return { path, frontmatter: validateFrontmatter(readSourceFile(path, readFrontmatter)) };
}

/** Load only the declared skill name from `SKILL.md`, for tap indexing. */
export function loadSkillName(path: string): string {
  const skillMdPath = join(path, "SKILL.md");
  assertManifestIsNotSymlink(skillMdPath, path);
  return validateFrontmatterName(readSourceFile(skillMdPath, readFrontmatter));
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
