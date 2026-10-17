/**
 * Skill candidates crew can't name (§8.3, §9 step 4, §10.1.1 step 2).
 *
 * Tap indexing reads only each candidate's declared name. One it can't
 * read — missing or invalid, behind a `SKILL.md` link crew won't follow,
 * in a file crew can't read, or in a folder that leads out of the
 * repository (C-SPEC-17) — has no name to index it under, so it isn't
 * indexed; it is kept here instead, by location, with the error that
 * says why, for re-expansion to report (C-UPD-18c) and a `<tap>/<skill>`
 * reference to it to fail with (C-REF-40), rather than vanishing.
 */

import { relative } from "node:path";
import { CrewError } from "../core/errors.ts";
import { loadSkillName } from "../skill/load.ts";
import { unreadablePathError } from "../util/errno.ts";
import { toPosix } from "../util/fs.ts";

/** A candidate the index found but couldn't name, and why. */
export interface UnnamedCandidate {
  /** Absolute path to the candidate: a skill directory, or a gist's skill file. */
  readonly path: string;
  /** Path relative to the tap root, POSIX-style; empty for the root itself. */
  readonly tapRelativePath: string;
  /** Why it has no name, its remedy and details intact. */
  readonly error: CrewError;
}

/** Why each candidate couldn't be named, by path: one entry per candidate, however often it's seen. */
export type NameFailures = Map<string, CrewError>;

/** The declared name of the candidate at `path`; null, recording why in `failures`, when it can't be read. */
export function nameRecordingFailure(path: string, failures: NameFailures): string | null {
  try {
    return loadSkillName(path);
  } catch (err) {
    // `loadSkillName` throws `CrewError`s: `invalid_skill` for the
    // author's faults, `source_unreachable` for a file crew couldn't use,
    // never blamed on the author (C-SPEC-16). A raw error reaching here
    // would be the latter too, and is recorded as one.
    failures.set(path, err instanceof CrewError ? err : unreadablePathError(path, err, "read"));
    return null;
  }
}

/** `failures` as candidates located in the tap rooted at `root`. */
export function unnamedAt(root: string, failures: NameFailures): UnnamedCandidate[] {
  const out: UnnamedCandidate[] = [];
  for (const [path, error] of failures) {
    out.push({ path, tapRelativePath: toPosix(relative(root, path)), error });
  }
  return out;
}
