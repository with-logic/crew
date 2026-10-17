/**
 * Skill expansion (§9 step 5).
 *
 * Four cases, checked in order:
 *   1. Root `SKILL.md` → one skill.
 *   2. Root `skills/` subdirectory present → walk under `skills/`:
 *      - Each immediate child with a `SKILL.md` is a skill.
 *      - Each immediate child WITHOUT a `SKILL.md` but containing
 *        child directories that do is a NAMESPACE — every child of
 *        that namespace that has a `SKILL.md` is a skill.
 *      - Exactly one level of namespace nesting. Deeper is ignored.
 *      - The source root itself is not walked in this case.
 *   3. Otherwise → walk ONE level under the source root.
 *   4. Only when 2–3 found no candidate and the tap's discovery is
 *      recursive → bounded recursive search (`./recursive.ts`).
 * Cases 2–3 are walked in `./skill-folders.ts`.
 *
 * A gist (§9 step 5, "Gists") replaces cases 2–4: after case 1, every
 * skill-shaped file at its root is a skill. A `//<file>` selection hands
 * this module the skill file itself, which is the one skill.
 *
 * In a git source, a candidate folder that leads out of the repository
 * through a link is an invalid candidate, never read
 * (`./source-boundary.ts`).
 *
 * Every case soft-fails: an invalid or unreadable candidate is collected
 * and returned as a `SkippedSkill` instead of aborting the walk. The caller decides
 * how to surface skips; the install flow reports them and exits
 * non-zero at the end, so a lone invalid skill (case 1, or a selected
 * file) still fails the command (C-INST-21). A location that produces
 * zero candidates, valid or not, aborts with `no_skills_found`.
 */

import type { CrewErrorName } from "../core/errors.ts";
import { CrewError } from "../core/errors.ts";
import { isGistTap } from "../core/gist-url.ts";
import type { LoadedSkill, TapConfig, TapDiscovery } from "../core/types.ts";
import { hasSkillMd, loadSkill } from "../skill/load.ts";
import { isSkillFile } from "../skill/skill-file.ts";
import { gistLabel, gistSkillCandidates, isOneSkillGist } from "./gist.ts";
import { findRecursiveSkillDirs } from "./recursive.ts";
import { standardSkillFolders } from "./skill-folders.ts";
import { leadsOutOfSource, outOfSourceError, type SourceBoundary } from "./source-boundary.ts";

/** A skill candidate that couldn't be loaded, or staged (§9 steps 4, 8). */
export interface SkippedSkill {
  /** Absolute path to the (would-be) skill directory, or a gist's skill file. */
  readonly path: string;
  /** Human-readable reason from the underlying `CrewError`. */
  readonly message: string;
  /** The error code: `invalid_skill`, or `source_unreachable` for a file crew couldn't read. */
  readonly code: SkipCode;
  /** The underlying error's next step, when it has its own. */
  readonly remedy?: string;
}

/** Why a candidate was skipped (§9 step 4): its own fault, or unreadable. */
export type SkipCode = Extract<CrewErrorName, "invalid_skill" | "source_unreachable">;

/** Result of an expansion: the valid skills plus any children skipped. */
export interface ExpansionResult {
  readonly valid: readonly LoadedSkill[];
  readonly skipped: readonly SkippedSkill[];
}

/**
 * How a source's skills are discovered (§9 step 5): the standard cases;
 * the standard cases with a recursive fallback (a tap's `discovery`,
 * §16.3 `--recursive`); or a gist's skill files.
 */
export type DiscoveryMode = "standard" | "gist" | TapDiscovery;

/** How `tap`'s skills are discovered. A gist is never walked recursively. */
export function discoveryOf(tap: Pick<TapConfig, "kind" | "url" | "discovery">): DiscoveryMode {
  if (isGistTap(tap)) return "gist";
  return tap.discovery ?? "standard";
}

/** Whether each mode searches recursively when the standard cases find nothing (case 4). */
const RECURSIVE_FALLBACK: Readonly<Record<DiscoveryMode, boolean>> = {
  standard: false,
  gist: false,
  recursive: true,
};

/** True when `mode` falls back to a recursive search (§9 step 5 case 4). */
export function fallsBackToRecursive(mode: DiscoveryMode): boolean {
  return RECURSIVE_FALLBACK[mode];
}

/**
 * Expand `root` the way `tap` lays out skills, inside `boundary`; a gist
 * is named by its URL and `sha` in errors.
 */
export function expandTapSkills(
  root: string,
  tap: TapConfig,
  sha: string | null,
  boundary: SourceBoundary,
): ExpansionResult {
  const mode = discoveryOf(tap);
  if (mode === "gist") return expandGist(root, gistLabel(tap, sha));
  return expandSkills(root, mode, boundary);
}

/** Case 1: `root` is itself one skill. */
export function isRootSkill(root: string, mode: DiscoveryMode): boolean {
  return mode === "gist" ? isOneSkillGist(root) : hasSkillMd(root);
}

/**
 * Expand a gist checkout (§9 step 5, "Gists"): one skill if it has a root
 * `SKILL.md`, the one file a `//<file>` selection resolved to, or else
 * every skill candidate at its root. `label` names the gist (URL and
 * commit) in the `no_skills_found` error.
 */
function expandGist(root: string, label: string): ExpansionResult {
  // A gist's skills are files, never links (§9 step 5): no folder to lead out.
  if (isOneSkillGist(root) || isSkillFile(root)) return loadCandidates([root], null);
  const result = loadCandidates(gistSkillCandidates(root), null);
  if (hasCandidates(result)) return result;
  throw new CrewError(
    "no_skills_found",
    `the gist ${label} has no skills — expected a root SKILL.md, or \`.md\` files that open with YAML frontmatter (\`---\`)`,
    { path: root },
    "Each skill in a gist is one `.md` file whose frontmatter declares its `name` and `description`.",
  );
}

/**
 * Expand a non-gist `root` into loaded skills plus any skipped candidates.
 * Candidates that fail to load (invalid or unreadable) are recorded in
 * `skipped` rather than thrown — the caller decides exit code and output.
 * `no_skills_found` is thrown only when there are zero candidates.
 */
export function expandSkills(
  root: string,
  mode: Exclude<DiscoveryMode, "gist">,
  boundary: SourceBoundary,
): ExpansionResult {
  if (hasSkillMd(root)) return loadCandidates([root], boundary);
  const result = loadCandidates(standardSkillFolders(root, boundary), boundary);
  if (hasCandidates(result)) return result;
  if (fallsBackToRecursive(mode)) {
    const recursive = loadCandidates(findRecursiveSkillDirs(root), boundary);
    if (hasCandidates(recursive)) return recursive;
  }
  throw new CrewError(
    "no_skills_found",
    `no valid skills found at \`${root}\` — expected a SKILL.md there, subdirectories that each contain one, or a \`skills/\` directory of either`,
    { path: root },
  );
}

/** True when an expansion produced any candidate, valid or not. */
function hasCandidates(result: ExpansionResult): boolean {
  return result.valid.length > 0 || result.skipped.length > 0;
}

/** Load each already-discovered candidate, soft-failing the invalid ones. */
function loadCandidates(paths: readonly string[], boundary: SourceBoundary): ExpansionResult {
  const valid: LoadedSkill[] = [];
  const skipped: SkippedSkill[] = [];
  for (const path of paths) {
    pushSoft(path, valid, skipped, boundary);
  }
  return { valid, skipped };
}

function pushSoft(
  candidate: string,
  valid: LoadedSkill[],
  skipped: SkippedSkill[],
  boundary: SourceBoundary,
): void {
  // §9 step 5 "Folder links": refused before anything in it is read.
  if (boundary !== null && leadsOutOfSource(boundary, candidate)) {
    skipped.push(skippedFrom(candidate, outOfSourceError(boundary, candidate), "invalid_skill"));
    return;
  }
  try {
    valid.push(loadSkill(candidate));
  } catch (err) {
    // `loadSkill` throws only `CrewError`: `source_unreachable` for a
    // `SKILL.md` it couldn't read, `invalid_skill` for the rest (§9 step 4).
    const ce = err as CrewError;
    const code = ce.code === "source_unreachable" ? "source_unreachable" : "invalid_skill";
    skipped.push(skippedFrom(candidate, ce, code));
  }
}

/** A skipped candidate at `path`, with `err`'s message and its remedy if it has one. */
export function skippedFrom(path: string, err: CrewError, code: SkipCode): SkippedSkill {
  const remedy = typeof err.remedy === "string" ? { remedy: err.remedy } : {};
  return { path, message: err.message, code, ...remedy };
}
