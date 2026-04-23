/**
 * Directory expansion (§9 step 5).
 *
 * Three cases, checked in order:
 *   1. Root `SKILL.md` → one skill.
 *   2. Root `skills/` subdirectory present → walk under `skills/`:
 *      - Each immediate child with a `SKILL.md` is a skill.
 *      - Each immediate child WITHOUT a `SKILL.md` but containing
 *        child directories that do is a NAMESPACE — every child of
 *        that namespace that has a `SKILL.md` is a skill.
 *      - Exactly one level of namespace nesting. Deeper is ignored.
 *      - The source root itself is not walked in this case.
 *   3. Otherwise → walk ONE level under the source root.
 *
 * Multi-skill expansions (cases 2 + 3) soft-fail: an invalid child
 * is collected and returned as a `SkippedSkill` instead of aborting
 * the whole walk. The caller decides how to surface skips; the
 * install flow reports them and exits non-zero at the end.
 * A location that produces zero valid skills (and no skips) aborts
 * with `no_skills_found`. The single-root-skill case (1) keeps
 * hard-fail semantics — if the user pointed at one skill and it's
 * invalid, that IS the whole input.
 */

import { join } from "node:path";
import { CrewError } from "../core/errors.ts";
import type { LoadedSkill } from "../core/types.ts";
import { hasSkillMd, loadSkill } from "../skill/load.ts";
import { isDirectory, listDir } from "../util/fs.ts";

/** A skill directory that couldn't be loaded. */
export interface SkippedSkill {
  /** Absolute path to the (would-be) skill directory. */
  readonly path: string;
  /** Human-readable reason from the underlying `CrewError`. */
  readonly message: string;
  /** The error code (typically `invalid_skill`). */
  readonly code: string;
}

/** Result of an expansion: the valid skills plus any children skipped. */
export interface ExpansionResult {
  readonly valid: readonly LoadedSkill[];
  readonly skipped: readonly SkippedSkill[];
}

/**
 * Expand `rootDir` into loaded skills plus any skipped children.
 * Validation failures (at any level) are recorded in `skipped`
 * rather than thrown — the caller decides exit code and output.
 * `no_skills_found` is still thrown when neither a valid skill nor
 * a validation failure is present (zero candidates).
 */
export function expandSkills(rootDir: string): ExpansionResult {
  if (hasSkillMd(rootDir)) {
    const valid: LoadedSkill[] = [];
    const skipped: SkippedSkill[] = [];
    pushSoft(rootDir, valid, skipped);
    return { valid, skipped };
  }
  const skillsDir = join(rootDir, "skills");
  const result = isDirectory(skillsDir)
    ? collectWithNamespaces(skillsDir)
    : collectSkillChildren(rootDir);
  if (result.valid.length === 0 && result.skipped.length === 0) {
    throw new CrewError(
      "no_skills_found",
      `no valid skills found at \`${rootDir}\` — expected a SKILL.md there, subdirectories that each contain one, or a \`skills/\` directory of either`,
      { path: rootDir },
    );
  }
  return result;
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

function pushSoft(candidate: string, valid: LoadedSkill[], skipped: SkippedSkill[]): void {
  try {
    valid.push(loadSkill(candidate));
  } catch (err) {
    // `loadSkill` throws only `CrewError`, whose `code` is typed as
    // a non-null `CrewErrorName`. No fallback needed.
    const ce = err as CrewError;
    skipped.push({ path: candidate, message: ce.message, code: ce.code });
  }
}
