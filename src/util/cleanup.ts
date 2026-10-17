/**
 * Best-effort cleanup after a failure (§9 step 8, §10.1.1 step 2): each
 * path is tried on its own, and one crew can't remove is named beside the
 * failure, which stays the error the user sees — never replaced by the
 * cleanup's own.
 */

import { errnoReason } from "./errno.ts";
import { rmrf } from "./fs.ts";

/** Remove each of `paths`; each one crew couldn't, as `` `path` (why) ``. */
export function removeEach(paths: readonly string[]): string[] {
  const left: string[] = [];
  for (const path of paths) {
    try {
      rmrf(path);
    } catch (err) {
      left.push(`\`${path}\` (crew couldn't remove it — ${errnoReason(err)})`);
    }
  }
  return left;
}

/**
 * `failure`, about to be rethrown, its message extended in place to name
 * what was `left` behind; its code and details stay its own. Unchanged
 * when nothing was left.
 */
export function withLeftBehind<T>(failure: T, left: readonly string[]): T {
  if (left.length > 0) (failure as Error).message += `; left in place: ${left.join(", ")}`;
  return failure;
}
