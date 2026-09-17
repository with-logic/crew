/**
 * Materialize several taps at one requested ref (§9 step 3).
 *
 * A qualified reference (`<tap>/<skill>@v1`) names its tap, so a single
 * export precedes resolution. A BARE name with a ref (`<skill>@v1`)
 * names no tap at all: the skill could live in any configured tap, and
 * §9 step 3 requires resolution itself to read the requested commit —
 * a skill present at `@v1` but deleted at the default branch must still
 * resolve. That means every candidate tap has to be materialized at the
 * ref before the name is matched against any of them.
 *
 * Taps that cannot supply the ref are simply absent from the result
 * rather than fatal: a bare name searches the whole tap set, and a tap
 * that never had this ref cannot contribute a candidate. Resolution
 * then reports `invalid_ref` naming the searched taps, which is the
 * right answer — not `ref_not_found` for an unrelated tap.
 */

import type { TapConfig } from "../../core/types.ts";
import { withAcquiredTap } from "./index.ts";

/**
 * Run `fn` with a root directory per tap that can supply `ref`, keyed
 * by tap name. Every scratch export lives only for the duration of
 * `fn`, matching `withAcquiredTap`'s lifetime rule.
 *
 * Nested rather than sequential: each export's cleanup is bound to its
 * own callback returning, so all roots must be live simultaneously for
 * `fn` to see them all.
 */
export function withTapsAtRef<T>(
  taps: readonly TapConfig[],
  ref: string,
  home: string,
  fn: (roots: Record<string, string | undefined>) => T,
): T {
  const roots: Record<string, string | undefined> = {};

  const step = (i: number): T => {
    if (i >= taps.length) return fn(roots);
    const tap = taps[i]!;
    // A path tap has no commits, so a ref cannot narrow it; it keeps its
    // usual root and needs no export.
    if (tap.kind === "path") return step(i + 1);
    // `reached` distinguishes "this tap could not supply the ref" from
    // "the inner callback threw". Only the former is recoverable; the
    // latter is the caller's error and must propagate untouched.
    let reached = false;
    try {
      return withAcquiredTap(tap, ref, home, (acquired) => {
        roots[tap.name] = acquired.rootDir;
        reached = true;
        return step(i + 1);
      });
    } catch (err) {
      if (reached) throw err;
      // This tap cannot supply the ref; carry on without it.
      return step(i + 1);
    }
  };

  return step(0);
}
