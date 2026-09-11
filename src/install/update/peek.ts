/**
 * Cheap "has this entry moved?" check for `crew update` (§10.1 step 3).
 *
 * Materializing a commit tree costs a full checkout of the tap, so the
 * routine case — an entry already at the SHA its ref names — answers
 * from the object database alone and never exports anything.
 */

import { tapPath } from "../../core/paths.ts";
import type { TapConfig } from "../../core/types.ts";
import { runGit } from "../../git/exec.ts";
import { resolveRef } from "../../git/repo.ts";

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
  const clone = tapPath(tap.name, home);
  if (!refPresent(clone, ref)) return null;
  return resolveRef(clone, ref);
}

/** True when `ref` already resolves in `clone`, without fetching. */
function refPresent(clone: string, ref: string | null): boolean {
  const target = ref === null ? "HEAD" : ref;
  const result = runGit(["rev-parse", "--verify", `${target}^{commit}`], {
    cwd: clone,
    throwOnError: false,
  });
  return result.exitCode === 0;
}
