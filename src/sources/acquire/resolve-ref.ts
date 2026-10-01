/** Fetch a missing requested ref without changing the shared working tree (§9 step 3). */

import { CrewError } from "../../core/errors.ts";
import { fetchRefs } from "../../git/repo/index.ts";
import { resolveRef } from "../../git/repo/refs.ts";

/**
 * Resolve `ref` in the clone, fetching once if it isn't there yet — a
 * tag published after the clone was made is the common case. A ref that
 * is still missing after the fetch is `ref_not_found` (exit 5).
 *
 * Only a genuinely missing ref triggers the retry. A repository or
 * process failure means something else is wrong, and swallowing it here
 * would report "no such ref" for a broken clone.
 *
 * The fetch updates refs WITHOUT checking anything out: the commit is
 * read from the object database, and the shared clone's working tree
 * must stay where concurrent readers expect it (§9 step 3).
 */
export function resolveRefFetchingIfNeeded(clonePath: string, ref: string): string {
  try {
    return resolveRef(clonePath, ref);
  } catch (err) {
    if (!(err instanceof CrewError && err.code === "ref_not_found")) throw err;
    fetchRefs(clonePath);
    return resolveRef(clonePath, ref);
  }
}
