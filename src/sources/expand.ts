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
 *
 * A gist (§9 step 5, "Gists") replaces cases 2–4: after case 1, every
 * skill-shaped file at its root is a skill. A `//<file>` selection hands
 * this module the skill file itself, which is the one skill.
 *
 * Every case soft-fails: an invalid candidate is collected and returned
 * as a `SkippedSkill` instead of aborting the walk. The caller decides
 * how to surface skips; the install flow reports them and exits
 * non-zero at the end, so a lone invalid skill (case 1, or a selected
 * file) still fails the command (C-INST-21). A location that produces
 * zero candidates, valid or not, aborts with `no_skills_found`.
 */

import { join } from "node:path";
import type { CrewErrorName } from "../core/errors.ts";
import { CrewError } from "../core/errors.ts";
import type { LoadedSkill, TapConfig, TapDiscovery } from "../core/types.ts";
import { hasSkillMd, loadSkill } from "../skill/load.ts";
import { isSkillFile } from "../skill/skill-file.ts";
import { isDirectory, listDir } from "../util/fs.ts";
import { gistLabel, gistSkillCandidates, isGistTap, isOneSkillGist } from "./gist.ts";
import { findRecursiveSkillDirs } from "./recursive.ts";

/** A skill candidate that couldn't be loaded. */
export interface SkippedSkill {
  /** Absolute path to the (would-be) skill directory, or a gist's skill file. */
  readonly path: string;
  /** Human-readable reason from the underlying `CrewError`. */
  readonly message: string;
  /** The error code: `invalid_skill`, or `source_unreachable` for a file crew couldn't read. */
  readonly code: SkipCode;
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

/** Expand `root` the way `tap` lays out skills; a gist is named by its URL and `sha` in errors. */
export function expandTapSkills(root: string, tap: TapConfig, sha: string | null): ExpansionResult {
  const mode = discoveryOf(tap);
  return mode === "gist" ? expandGist(root, gistLabel(tap, sha)) : expandSkills(root, mode);
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
  if (isOneSkillGist(root) || isSkillFile(root)) return loadCandidates([root]);
  const result = loadCandidates(gistSkillCandidates(root));
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
 * Validation failures (at any level) are recorded in `skipped`
 * rather than thrown — the caller decides exit code and output.
 * `no_skills_found` is still thrown when neither a valid skill nor
 * a validation failure is present (zero candidates).
 */
export function expandSkills(root: string, mode: Exclude<DiscoveryMode, "gist">): ExpansionResult {
  if (hasSkillMd(root)) return loadCandidates([root]);
  const skillsDir = join(root, "skills");
  const result = isDirectory(skillsDir)
    ? collectWithNamespaces(skillsDir)
    : collectSkillChildren(root);
  if (hasCandidates(result)) return result;
  if (mode === "recursive") {
    const recursive = loadCandidates(findRecursiveSkillDirs(root));
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

/**
 * Walk `skills/` one level deep, descending into namespace dirs
 * (children that lack a `SKILL.md` but contain child skill dirs).
 */
function collectWithNamespaces(skillsDir: string): ExpansionResult {
  const valid: LoadedSkill[] = [];
  const skipped: SkippedSkill[] = [];
  for (const name of listDir(skillsDir)) {
    const candidate = join(skillsDir, name);
    if (!isDirectory(candidate)) continue;
    if (hasSkillMd(candidate)) {
      pushSoft(candidate, valid, skipped);
      continue;
    }
    // `candidate` has no SKILL.md — treat as a namespace if at least
    // one grandchild has a SKILL.md. Non-namespace dirs under
    // `skills/` (e.g. docs, scripts) are silently ignored.
    const inner = collectSkillChildren(candidate);
    valid.push(...inner.valid);
    skipped.push(...inner.skipped);
  }
  return { valid, skipped };
}

function collectSkillChildren(dir: string): ExpansionResult {
  const valid: LoadedSkill[] = [];
  const skipped: SkippedSkill[] = [];
  for (const name of listDir(dir)) {
    const candidate = join(dir, name);
    if (!isDirectory(candidate)) continue;
    if (!hasSkillMd(candidate)) continue;
    pushSoft(candidate, valid, skipped);
  }
  return { valid, skipped };
}

/** Load each already-discovered candidate, soft-failing the invalid ones. */
function loadCandidates(paths: readonly string[]): ExpansionResult {
  const valid: LoadedSkill[] = [];
  const skipped: SkippedSkill[] = [];
  for (const path of paths) {
    pushSoft(path, valid, skipped);
  }
  return { valid, skipped };
}

function pushSoft(candidate: string, valid: LoadedSkill[], skipped: SkippedSkill[]): void {
  try {
    valid.push(loadSkill(candidate));
  } catch (err) {
    // `loadSkill` throws only `CrewError`: `source_unreachable` for a
    // `SKILL.md` it couldn't read, `invalid_skill` for the rest (§9 step 4).
    const ce = err as CrewError;
    const code = ce.code === "source_unreachable" ? "source_unreachable" : "invalid_skill";
    skipped.push({ path: candidate, message: ce.message, code });
  }
}
