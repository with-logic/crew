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
import type { GitSource, PathSource, TapConfig } from "../core/types.ts";
import { isGistUrl } from "../refs/gist.ts";
import { opensFrontmatter } from "../skill/frontmatter.ts";
import { listDir, readText } from "../util/fs.ts";
import { isRegularFile } from "../util/regular-file.ts";
import { assertNoSymlinkEscape } from "../util/symlink-containment.ts";

/** True when `tap` is backed by a GitHub gist and so uses the gist layout. */
export function isGistTap(tap: Pick<TapConfig, "kind" | "url">): boolean {
  return tap.kind === "git" && isGistUrl(tap.url);
}

/** The skill-file candidates at the root of a gist checkout, in name order. */
export function gistSkillFiles(rootDir: string): string[] {
  const files: string[] = [];
  for (const name of listDir(rootDir).sort()) {
    const path = join(rootDir, name);
    if (isGistSkillFile(path)) files.push(path);
  }
  return files;
}

/** A regular `.md` file whose first non-blank line opens frontmatter. A symlink never is. */
export function isGistSkillFile(path: string): boolean {
  return /\.md$/i.test(path) && isRegularFile(path) && opensFrontmatter(readText(path));
}

/** A source with any gist `//<file>` selection split off. */
export interface GistSelection {
  /** The source naming the whole gist (or the input, for anything else). */
  readonly source: GitSource | PathSource;
  /** The selected file, or `""` when the whole source was named. */
  readonly file: string;
}

/**
 * Split a gist reference's `//<file>` off (§8.2). A gist tap is always
 * the whole gist; the file instead narrows the install to one of its
 * skills, the way `<tap>/<skill>` does. Every other source passes
 * through untouched, keeping its subpath on the tap.
 */
export function splitGistFile(source: GitSource | PathSource): GistSelection {
  if (source.type === "path" || source.subpath === "" || !isGistUrl(source.url)) {
    return { source, file: "" };
  }
  return { source: { ...source, subpath: "" }, file: source.subpath };
}

/**
 * Where to expand inside an acquired gist root: the root itself, or the
 * one file a `//<file>` reference selected. Like any resolved subpath,
 * the file must be reached without traversing a symlink (§8.4).
 */
export function gistLocation(rootDir: string, file: string): string {
  if (file === "") return rootDir;
  const target = join(rootDir, file);
  assertNoSymlinkEscape(rootDir, target, `gist file \`${file}\``);
  return target;
}
