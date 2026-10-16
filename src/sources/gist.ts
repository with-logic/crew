/**
 * Gist layout (§9 step 5, "Gists").
 *
 * A gist cannot contain directories, so none of the standard layouts
 * match one. Instead each top-level `.md` file that opens with YAML
 * frontmatter is a skill candidate in its own right: the file is that
 * skill's SKILL.md. A gist with a root `SKILL.md` is still one skill
 * (case 1): discovery checks `isOneSkillGist` first, and `selectGistFile`
 * refuses a `//<file>` on such a gist.
 *
 * Whether a tap is a gist is derived from its URL (§8.2), so the layout
 * is never recorded in config, state, or markers — `doctor --repair`
 * rebuilding a tap from a marker's `tap_url` gets it back for free.
 */

import { lstatSync } from "node:fs";
import { basename, join } from "node:path";
import { CrewError } from "../core/errors.ts";
import { isGistUrl } from "../core/gist-url.ts";
import type { TapConfig } from "../core/types.ts";
import { displayText, displayUrl } from "../refs/display-url.ts";
import { opensFrontmatter } from "../skill/frontmatter.ts";
import { isSkillFile } from "../skill/skill-file.ts";
import { listDir, readText } from "../util/fs.ts";
import type { AcquiredTap } from "./acquire/index.ts";

/**
 * True when the gist checked out at `root` has a root `SKILL.md` and so is
 * one skill. Matched by exact name — on a case-insensitive disk a skill
 * file called `skill.md` would otherwise pass for it — and only as a
 * regular file: a symlink is never a gist skill file or root SKILL.md
 * (§9 step 5).
 */
export function isOneSkillGist(root: string): boolean {
  return listDir(root).includes("SKILL.md") && isSkillFile(join(root, "SKILL.md"));
}

/** The skill candidates at the root of a gist checkout, in name order. */
export function gistSkillCandidates(root: string): string[] {
  const paths: string[] = [];
  for (const name of listDir(root).sort()) {
    const path = join(root, name);
    if (isGistSkillCandidate(path)) paths.push(path);
  }
  return paths;
}

/**
 * A skill file whose first non-blank line opens frontmatter: what
 * discovery treats as a skill. A file named by `//<file>` only has to be
 * a skill file — it is validated whether or not it opens frontmatter.
 * One crew can't read stays a candidate, so loading it reports the file
 * as unreadable (§9 step 4) instead of one file sinking the whole gist.
 */
export function isGistSkillCandidate(path: string): boolean {
  if (!isSkillFile(path)) return false;
  try {
    return opensFrontmatter(readText(path));
  } catch {
    return true;
  }
}

/** How gist errors name a gist: its URL and the commit read (a gist tap is always git). */
export function gistLabel(tap: Pick<TapConfig, "url">, sha: string | null): string {
  return `${displayUrl(tap.url)} at ${(sha ?? "").slice(0, 8)}`;
}

/**
 * Where to expand inside an acquired source: the one skill file a gist
 * `//<file>` selected (§8.2), or — with no file selected, as for every
 * non-gist source — the root itself. A gist with a root `SKILL.md` is a
 * single skill whose other files are its resources, so no file of it
 * can be selected on its own. The file must not be a symlink (§8.4),
 * and naming a file the gist doesn't have is `no_skills_found` listing
 * its skill files.
 */
export function selectGistFile(
  acquired: AcquiredTap,
  tap: TapConfig,
  gistFile: string,
  ref: string | null,
): string {
  const { rootDir } = acquired;
  if (gistFile === "") return rootDir;
  const shown = displayText(gistFile);
  const where = gistLabel(tap, acquired.resolvedSha);
  // The whole-gist command keeps the user's pin.
  const wholeGist = `crew install ${displayUrl(tap.url)}${ref === null ? "" : `@${displayText(ref)}`}`;
  if (isOneSkillGist(rootDir)) {
    throw new CrewError(
      "invalid_ref",
      `the gist ${where} is one skill (it has a root SKILL.md), so \`//${shown}\` can't select a file of it`,
      { file: shown },
      `Install the whole gist: \`${wholeGist}\`.`,
    );
  }
  const target = join(rootDir, gistFile);
  // Matched by exact name: a case-insensitive disk would also find `PRD.md`.
  const present = listDir(rootDir).includes(gistFile);
  // `gistFile` is one top-level name (`splitGistFile`), so the file itself
  // is the only place a link could be (§8.4).
  if (present && lstatSync(target).isSymbolicLink()) {
    throw new CrewError(
      "invalid_ref",
      `\`${shown}\` in the gist ${where} is a symlink — crew installs only regular files from a gist`,
      { file: shown },
      `Name the file it points to after \`//\`, or install the whole gist: \`${wholeGist}\`.`,
    );
  }
  if (!(present && isSkillFile(target))) {
    const files = gistSkillCandidates(rootDir).map((path) => basename(path));
    const remedy =
      files.length === 0
        ? "The gist has no skills: each skill is a top-level `.md` file that opens with frontmatter."
        : `Its skills are in ${files.map((f) => `\`${displayText(f)}\``).join(", ")} (names are case-sensitive).`;
    throw new CrewError(
      "no_skills_found",
      `the gist ${where} has no file \`${shown}\``,
      { file: shown, files },
      remedy,
    );
  }
  return target;
}

/**
 * Reject `--recursive` (§16.3) for a gist. It widens discovery past the
 * standard layout, but a gist's skills are always its top-level `.md`
 * files — recording it would claim a discovery mode that never applies.
 */
export function assertNoRecursiveGist(url: string): void {
  if (!isGistUrl(url)) return;
  throw new CrewError(
    "usage_error",
    "`--recursive` doesn't apply to a gist — its skills are always the `.md` files at its top level",
    { url: displayUrl(url) },
    "Drop `--recursive` and try again.",
  );
}
