/**
 * Skill candidates whose `name` can't be read (§9 step 4, §10.1.1 step 2).
 *
 * Tap indexing reads only each candidate's declared name. One it can't
 * read — missing or invalid, behind a `SKILL.md` link crew won't follow,
 * or in a file crew can't read — has no name to index it under, so it
 * isn't indexed; it is kept here instead, by location, for re-expansion
 * to report, rather than vanishing from every update.
 */

import { relative } from "node:path";
import type { CrewErrorName } from "../core/errors.ts";
import { loadSkillName } from "../skill/load.ts";
import { crewErrorNameOf } from "../util/errno.ts";
import { toPosix } from "../util/fs.ts";

/** A candidate the index found but couldn't name, and why. */
export interface UnloadableCandidate {
  /** Absolute path to the candidate: a skill directory, or a gist's skill file. */
  readonly path: string;
  /** Path relative to the tap root, POSIX-style; empty for the root itself. */
  readonly tapRelativePath: string;
  readonly error: { readonly code: CrewErrorName; readonly message: string };
}

/** Why each candidate couldn't be named, by path: one entry per candidate, however often it's seen. */
export type LoadFailures = Map<string, UnloadableCandidate["error"]>;

/** The declared name of the candidate at `path`; null, recording why in `failures`, when it can't be read. */
export function nameOrFailure(path: string, failures: LoadFailures): string | null {
  try {
    return loadSkillName(path);
  } catch (err) {
    // `loadSkillName` names the author's faults `invalid_skill`. Anything
    // else is a file crew couldn't use — a raw filesystem error, even one
    // Bun leaves without its `syscall` (a path too long) — and is never
    // blamed on the author (C-SPEC-16).
    failures.set(path, {
      code: crewErrorNameOf(err, "source_unreachable"),
      message: (err as Error).message,
    });
    return null;
  }
}

/** `failures` as candidates located in the tap rooted at `root`. */
export function unloadableAt(root: string, failures: LoadFailures): UnloadableCandidate[] {
  const out: UnloadableCandidate[] = [];
  for (const [path, error] of failures) {
    out.push({ path, tapRelativePath: toPosix(relative(root, path)), error });
  }
  return out;
}
