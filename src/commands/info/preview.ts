/**
 * Source preview for `crew info <ref>` (§9.1, §9 step 3).
 *
 * Everything here answers "which skills does this reference name, and
 * what do they look like?" for a reference that is NOT already installed.
 *
 * The `@<ref>` rule drives the shape: with a ref, the commit is exported
 * BEFORE resolution, because a skill present at that commit but deleted
 * at the default branch is invisible to an index of the live clone. A
 * qualified reference (`<tap>/<skill>@v1`) names its tap, so one export
 * suffices; a bare name could live in any tap, so every tap is
 * materialized at the ref before the name is matched.
 */

import type { Config, LoadedSkill, TapConfig, TapSource } from "../../core/types.ts";
import { type NonTapNameCandidate, resolveTapRef } from "../../install/resolve-ref/index.ts";
import { loadSkill } from "../../skill/load.ts";
import { withTapsAtRef } from "../../sources/acquire/at-ref.ts";
import { withAcquiredTap } from "../../sources/acquire/index.ts";
import { expandSkills } from "../../sources/expand.ts";
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

  const named = source.tap === null ? undefined : config.taps.find((t) => t.name === source.tap);
  if (named) {
    return withAcquiredTap(named, ref, home, (acq) =>
      narrowAtRoots(source, config, home, { [named.name]: acq.rootDir }),
    );
  }
  return withTapsAtRef(config.taps, ref, home, (roots) =>
    narrowAtRoots(source, config, home, roots),
  );
}

/** Expand a tap's skills, reading at `ref` when one was requested. */
export function skillsAtRef(tap: TapConfig, ref: string | null, home: string): SkillInfo[] {
  return withAcquiredTap(tap, ref, home, (acq) => buildSkillInfos(acq.rootDir, tap));
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
  const wanted = new Set(
    (candidate.kind === "skill" ? [candidate.location] : candidate.members).map((l) => l.name),
  );
  const root = roots[candidate.tap.name];
  const all =
    root === undefined
      ? buildSkillInfosFromDirs(
          candidate.kind === "skill" ? [candidate.location] : candidate.members,
        )
      : buildSkillInfos(root, candidate.tap);
  return { tap: candidate.tap, skills: all.filter((sk) => wanted.has(sk.name)) };
}

/** Preview a candidate resolved against the live clone (no ref given). */
function candidateSkills(candidate: NonTapNameCandidate): TapPreview {
  if (candidate.kind === "skill") {
    return { tap: candidate.tap, skills: buildSkillInfosFromDirs([candidate.location]) };
  }
  return { tap: candidate.tap, skills: buildSkillInfosFromDirs(candidate.members) };
}

function buildSkillInfos(dir: string, tap: TapConfig): SkillInfo[] {
  const { valid } = expandSkills(dir, { recursive: tap.discovery === "recursive" });
  return valid.map(skillInfoOf);
}

function buildSkillInfosFromDirs(dirs: readonly { readonly path: string }[]): SkillInfo[] {
  return dirs.map((dir) => skillInfoOf(loadSkill(dir.path)));
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
