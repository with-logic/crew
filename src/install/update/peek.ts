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
  // One rev-parse answers both questions: a ref absent from the clone
  // exits non-zero, and a present one prints the commit we want. Asking
  // twice — once to test, once to read — doubles the subprocess cost of
  // the routine "nothing moved" path this function exists to make cheap.
  const target = ref === null ? "HEAD" : ref;
  const result = runGit(["rev-parse", "--verify", `${target}^{commit}`], {
    cwd: clone,
    throwOnError: false,
  });
  if (result.exitCode !== 0) return null;
  const sha = result.stdout.trim();
  return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}
