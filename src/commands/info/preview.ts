/**
 * Source preview for `crew info <ref>` (§9.1, §9 step 3).
 *
 * Everything here answers "which skills does this reference name, and
 * what do they look like?" for a reference that is NOT already installed.
 *
 * The `@<ref>` rule drives the shape: with a ref, the commit is exported
 * BEFORE resolution, because a skill present at that commit but deleted
 * at the default branch is invisible to an index of the live clone. A
 * three-segment reference names one tap. Bare names and two-segment
 * namespace fallback can search every tap at the requested ref.
 */

import { CrewError } from "../../core/errors.ts";
import type { Config, LoadedSkill, TapConfig, TapSource } from "../../core/types.ts";
import { type NonTapNameCandidate, resolveTapRef } from "../../install/resolve-ref/index.ts";
import { withResolutionRoots } from "../../install/resolve-ref/roots.ts";
import { loadSkill, skillFileRemedy } from "../../skill/load.ts";
import { isSkillFile } from "../../skill/skill-file.ts";
import { withAcquiredTap } from "../../sources/acquire/index.ts";
import { discoveryOf, expandSkills } from "../../sources/expand.ts";
import { gistWhere, selectGistFile } from "../../sources/gist.ts";
import type { SkillInfo } from "./render.ts";

export interface TapPreview {
  readonly tap: TapConfig;
  readonly skills: SkillInfo[];
}

/** Resolve a tap-source reference and preview what it names. */
export function tapCandidate(
  source: TapSource,
  config: Config,
  ref: string | null,
  home: string,
): TapPreview {
  if (ref === null) {
    return candidateSkills(resolveTapRef(source, config, home, "non-tap"));
  }

  return withResolutionRoots({ ...source, ref }, config, home, (atRef, roots) =>
    narrowAtRoots(source, atRef, home, roots),
  );
}

/**
 * Expand a tap's skills, reading at `ref` when one was requested.
 * `gistFile` narrows a gist tap to the one skill file a `//<file>` named
 * (§8.2).
 */
export function skillsAtRef(
  tap: TapConfig,
  ref: string | null,
  home: string,
  gistFile = "",
): SkillInfo[] {
  return withAcquiredTap(tap, ref, home, (acq) =>
    previewSkills(selectGistFile(acq, tap, gistFile), tap, gistWhere(tap, acq.resolvedSha)),
  );
}

/**
 * Resolve against already-materialized roots and expand the winning tap
 * at the same root, so both the match and the previewed bytes come from
 * the requested commit.
 */
function narrowAtRoots(
  source: TapSource,
  config: Config,
  home: string,
  roots: Readonly<Record<string, string | undefined>>,
): TapPreview {
  const candidate = resolveTapRef(source, config, home, "non-tap", roots);
  return candidateSkills(candidate);
}

/** Preview only the selected locations while their acquisition scope is live. */
function candidateSkills(candidate: NonTapNameCandidate): TapPreview {
  if (candidate.kind === "skill") {
    return { tap: candidate.tap, skills: buildSkillInfosAt([candidate.location]) };
  }
  return { tap: candidate.tap, skills: buildSkillInfosAt(candidate.members) };
}

/**
 * The valid skills at `location`. When it holds candidates but none is
 * valid, the preview fails with the reason, as an install of the same
 * reference would (§9.1, C-INST-21): "No skills here" would hide why.
 */
function previewSkills(location: string, tap: TapConfig, where: string): SkillInfo[] {
  const { valid, skipped } = expandSkills(location, discoveryOf(tap), where);
  const [first] = skipped;
  if (valid.length === 0 && first) {
    const message =
      skipped.length === 1
        ? first.message
        : `none of the ${skipped.length} skills here is valid — ${first.message}`;
    const remedy = isSkillFile(first.path) ? skillFileRemedy(first.path) : undefined;
    throw new CrewError(
      "invalid_skill",
      message,
      { path: first.path, invalid: skipped.length },
      remedy,
    );
  }
  return valid.map(skillInfoOf);
}

function buildSkillInfosAt(locations: readonly { readonly path: string }[]): SkillInfo[] {
  return locations.map((l) => skillInfoOf(loadSkill(l.path)));
}

function skillInfoOf(s: LoadedSkill): SkillInfo {
  return {
    name: s.frontmatter.name,
    description: s.frontmatter.description,
    license: s.frontmatter.license ?? null,
    compatibility: s.frontmatter.compatibility ?? null,
    homepage: s.frontmatter.metadata?.crew?.homepage ?? null,
    dependencies: s.frontmatter.metadata?.crew?.dependencies ?? [],
  };
}
