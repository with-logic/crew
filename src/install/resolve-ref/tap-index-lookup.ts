/**
 * Tap-index access for reference resolution (§8.3).
 *
 * Every lookup here honours `TapRoots`: when a reference carried an
 * `@<ref>`, its commit was exported first and the root of that export
 * is what gets indexed, so resolution sees the requested commit rather
 * than the shared clone's checked-out revision (§9 step 3).
 */

import { posix } from "node:path";
import { CrewError } from "../../core/errors.ts";
import { gistSkillStem, isGistTap } from "../../core/gist-url.ts";
import type { TapConfig } from "../../core/types.ts";
import { indexTap, namespaceOf, type TapIndex } from "../tap-index.ts";
import type { NonTapNameCandidate, TapRoots } from "./types.ts";

/** Index `tap`, reading from its exported root when one was supplied. */
export function indexTapAt(tap: TapConfig, home: string, roots: TapRoots): TapIndex {
  return indexTap(tap, home, roots[tap.name]);
}

/** `tap`'s index, or what kept crew from building it. */
export type IndexAttempt = { readonly index: TapIndex } | { readonly failure: unknown };

/** Index `tap`, keeping the failure rather than throwing it. */
export function tryIndexTap(tap: TapConfig, home: string, roots: TapRoots): IndexAttempt {
  try {
    return { index: indexTapAt(tap, home, roots) };
  } catch (failure) {
    return { failure };
  }
}

/**
 * Index `tap`, or null when it can't be read. A tap that fails to
 * materialize must not abort resolution across the other taps — the
 * caller is searching for a name and an unreadable tap simply cannot
 * contribute a candidate.
 */
export function safeIndex(tap: TapConfig, home: string, roots: TapRoots): TapIndex | null {
  const attempt = tryIndexTap(tap, home, roots);
  return "index" in attempt ? attempt.index : null;
}

/**
 * Why a reference to `name` (under `namespace`, when given) finds nothing
 * indexed in `tap` (C-REF-40): a candidate there that crew couldn't name
 * — one leading out of the repository, with an invalid `name`, or that
 * crew can't read — or one above it, `skills/` or the namespace. Null
 * when there is none: the name is simply missing. A gist's candidate is
 * its file, named without `.md` in any case.
 */
export function unnamedCandidateError(
  tap: TapConfig,
  index: TapIndex,
  name: string,
  namespace: string | null,
): CrewError | null {
  const above = new Set(["skills", ...(namespace === null ? [] : [`skills/${namespace}`])]);
  const gist = isGistTap(tap);
  for (const candidate of index.unnamed) {
    const last = posix.basename(candidate.tapRelativePath);
    const leaf = gist ? gistSkillStem(last) : last;
    const inNamespace = namespace === null || namespaceOf(candidate.tapRelativePath) === namespace;
    if ((leaf === name && inNamespace) || above.has(candidate.tapRelativePath)) {
      const { code, message, details, remedy } = candidate.error;
      return new CrewError(code, message, { ...details, path: candidate.path }, remedy);
    }
  }
  return null;
}

/** The skill named `name` in `tap`'s `index`, preferring an unnamespaced match. */
export function lookupInIndex(
  tap: TapConfig,
  index: TapIndex,
  name: string,
): NonTapNameCandidate | null {
  const locs = index.skills.get(name);
  if (!locs || locs.length === 0) return null;
  // Prefer unnamespaced. If the same name lives in multiple
  // namespaces, a 2-segment ref is ambiguous within the tap; we pick
  // deterministically and rely on 3-segment for true disambiguation.
  const unnamespaced = locs.find((l) => l.namespace === null);
  return { kind: "skill", tap, location: unnamespaced ?? locs[0]! };
}
