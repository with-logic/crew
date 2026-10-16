/**
 * Gist layout (§9 step 5, "Gists").
 *
 * A gist cannot contain directories, so none of the standard layouts
 * match one. Instead each top-level `.md` file that opens with YAML
 * frontmatter is a skill candidate in its own right: the file is that
 * skill's SKILL.md. A gist with a root `SKILL.md` is still one skill
 * (case 1), which callers check before reaching for anything here.
 *
 * Whether a tap is a gist is derived from its URL (§8.2), so the layout
 * is never recorded in config, state, or markers — `doctor --repair`
 * rebuilding a tap from a marker's `tap_url` gets it back for free.
 */

import { join } from "node:path";
import { CrewError } from "../core/errors.ts";
import { isGistUrl } from "../core/gist-url.ts";
import type { TapConfig } from "../core/types.ts";
import { displayText, displayUrl } from "../refs/display-url.ts";
import { opensFrontmatter } from "../skill/frontmatter.ts";
import { hasSkillMd } from "../skill/load.ts";
import { isSkillFile } from "../skill/skill-file.ts";
import { listDir, readText } from "../util/fs.ts";
import { assertNoSymlinkEscape } from "../util/symlink-containment.ts";
import type { AcquiredTap } from "./acquire/index.ts";

/** True when `tap` is backed by a GitHub gist and so uses the gist layout. */
export function isGistTap(tap: Pick<TapConfig, "kind" | "url">): boolean {
  return tap.kind === "git" && isGistUrl(tap.url);
}

/** The skill-file candidates at the root of a gist checkout, in name order. */
export function gistSkillFiles(rootDir: string): string[] {
  const paths: string[] = [];
  for (const name of listDir(rootDir).sort()) {
    const path = join(rootDir, name);
    if (isGistSkillFile(path)) paths.push(path);
  }
  return paths;
}

/** A skill file whose first non-blank line opens frontmatter. A symlink never is. */
export function isGistSkillFile(path: string): boolean {
  return isSkillFile(path) && opensFrontmatter(readText(path));
}

/**
 * Where to expand inside an acquired gist: its root, or the one file a
 * `//<file>` reference selected (§8.2). A gist with a root `SKILL.md` is
 * a single skill whose other files are its resources, so no file of it
 * can be selected on its own. Like any resolved subpath, the file must
 * be reached without traversing a symlink (§8.4), and naming a file the
 * gist doesn't have is `no_skills_found` naming that file.
 */
export function selectGistFile(acquired: AcquiredTap, tap: TapConfig, file: string): string {
  const { rootDir } = acquired;
  if (file === "") return rootDir;
  const shown = displayText(file);
  const where = `${displayUrl(tap.url)} at ${(acquired.resolvedSha ?? "").slice(0, 8)}`;
  if (hasSkillMd(rootDir)) {
    throw new CrewError(
      "invalid_ref",
      `the gist ${where} is one skill (it has a root SKILL.md), so \`//${shown}\` can't select a file of it`,
      { file: shown },
      `Install the whole gist: \`crew install ${displayUrl(tap.url)}\`.`,
    );
  }
  const target = join(rootDir, file);
  assertNoSymlinkEscape(rootDir, target, `gist file \`${shown}\``);
  // Matched by exact name: a case-insensitive disk would also find `PRD.md`.
  if (!(listDir(rootDir).includes(file) && isSkillFile(target))) {
    throw new CrewError(
      "no_skills_found",
      `the gist ${where} has no file \`${shown}\``,
      { file: shown },
      "Gist file names are case-sensitive. `crew info <gist-url>` lists the gist's skills.",
    );
  }
  return target;
}
