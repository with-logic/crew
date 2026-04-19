/**
 * Skill reference parser (§8).
 *
 * A skill reference is the string the user passes to `crew install`, puts
 * in a `metadata.crew.dependencies` entry, or types into `crew info`. It
 * can be one of three shapes:
 *
 *   - path:  `./foo`, `../foo`, `/foo`, `~/foo`
 *   - git:   any https/ssh URL, optionally with `@ref` and/or `//subpath`.
 *            Shorthand hosts `gh:`, `gl:`, `bb:` expand to github/gitlab/
 *            bitbucket. A `.git` suffix is allowed and stripped for
 *            canonicalization.
 *   - tap:   `<skill>` or `<tap>/<skill>`, optionally `@ref`.
 *
 * The precedence rules in §8.5 disambiguate any overlap. `invalid_ref` is
 * thrown for anything that doesn't fit the grammar.
 *
 * Shape-specific parsing lives in `refs/git-url.ts` (git) and
 * `refs/parsers.ts` (path + tap). This file is the shape dispatcher.
 */

import { CrewError } from "../core/errors.ts";
import type { Source } from "../core/types.ts";
import {
  looksLikeAtShorthand,
  looksLikeExplicitGit,
  looksLikeShorthand,
  parseGit,
} from "./git-url.ts";
import { looksLikePath, NAME_PATTERN, parsePath, parseTap } from "./parsers.ts";

/** Parse a skill reference per §8. `cwd` is used to resolve relative paths. */
export function parseRef(raw: string, cwd: string = process.cwd()): Source {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new CrewError("invalid_ref", "no skill reference given");
  }
  const ref = raw.trim();

  // §8.5 precedence: path > explicit URL / shorthand > leading-@ GitHub
  // shorthand > contains // > tap.
  if (looksLikePath(ref)) {
    return parsePath(ref, cwd);
  }
  if (looksLikeExplicitGit(ref) || looksLikeShorthand(ref)) {
    return parseGit(ref);
  }
  if (looksLikeAtShorthand(ref)) {
    return parseGit(ref);
  }
  if (ref.includes("//")) {
    return parseGit(ref);
  }
  return parseTap(ref);
}

/**
 * Decide whether a resolved `ref` string is "pinned" (§11.1): exact SHA or
 * tag. We can't distinguish tag from branch without talking to git, so this
 * answers the SHA-only case. `pinned` for tags is marked later, after the
 * git layer reports what kind of ref it resolved.
 */
export function looksLikeSha(ref: string): boolean {
  return /^[0-9a-f]{7,40}$/i.test(ref);
}

// Re-exported so callers that only import `parse.ts` still see the name pattern.
export { NAME_PATTERN };
