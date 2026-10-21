/** GitHub gist layout detection and fully validated file discovery (§8.2, §9 step 5). */

import { lstatSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../core/errors.ts";
import type { LoadedSkill, TapConfig } from "../core/types.ts";
import { loadSkill } from "../skill/load.ts";
import { listDir } from "../util/fs.ts";

/** Select the gist file layout without changing the source's git identity. */
export function isGistTap(tap: Pick<TapConfig, "kind" | "url">): boolean {
  return tap.kind === "git" && /^https:\/\/gist\.github\.com\//i.test(tap.url);
}

/** Only top-level regular files with complete valid frontmatter are candidates. */
export function scanGist(root: string): LoadedSkill[] {
  const skills: LoadedSkill[] = [];
  for (const filename of listDir(root)) {
    const path = join(root, filename);
    if (!lstatSync(path).isFile()) continue;
    try {
      skills.push(loadSkill(path, true));
    } catch (err) {
      if (!(err instanceof CrewError && err.code === "invalid_skill")) throw err;
    }
  }
  return skills;
}
