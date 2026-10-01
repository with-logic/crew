/**
 * Cheap "has this entry moved?" check for `crew update` (§10.1 step 3).
 *
 * Materializing a commit tree costs a full checkout of the tap, so the
 * routine case — an entry already at the SHA its ref names — answers
 * from the object database alone and never exports anything.
 */

import { CrewError } from "../../core/errors.ts";
import { tapClonePath } from "../../core/repo-path.ts";
import type { TapConfig } from "../../core/types.ts";
import { resolveRef } from "../../git/repo/refs.ts";
import { migrateTapClone } from "../../sources/migrate-clones.ts";

/**
 * The SHA `ref` currently names in `tap`'s clone, without materializing
 * anything — or null when that can't be answered cheaply.
 *
 * A path tap has no commits, and a ref absent from the clone needs a
 * fetch first; both fall through to the normal acquisition path rather
 * than duplicating its fetch-and-retry logic here.
 */
export function peekResolvedSha(tap: TapConfig, ref: string | null, home: string): string | null {
  if (tap.kind !== "git") return null;
  migrateTapClone(tap, home);
  const clone = tapClonePath(tap, home);
  try {
    return resolveRef(clone, ref);
  } catch (err) {
    if (err instanceof CrewError && err.code === "ref_not_found") return null;
    throw err;
  }
}
