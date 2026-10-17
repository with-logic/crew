/**
 * Per-run tap scan cache (§10.1.1).
 *
 * State entries are grouped by `(tap, scope, project_root, ref)`, so one tap
 * can back several groups — a user install plus two project installs,
 * say. The groups at the default branch share one clone, so acquiring
 * it, walking its children, and validating each child are identical work
 * repeated per group. (A group at an explicit ref acquires its own export
 * of that ref, never through `acquire`, which is keyed by tap name alone.)
 *
 * This memoises all three for the lifetime of one update run. Clone
 * locks are held across the run (see `sources/tap-lock.ts`), so the
 * snapshot cannot go stale underneath us.
 */

import type { CrewError } from "../../core/errors.ts";
import type { TapConfig } from "../../core/types.ts";
import { loadSkill } from "../../skill/load.ts";
import { acquireTap } from "../../sources/acquire/index.ts";
import { currentTapChildren, type TapChildren } from "../tap-children.ts";

/** One tap's acquired clone location. */
export interface AcquiredTapScan {
  readonly rootDir: string;
  readonly resolvedSha: string | null;
}

export interface TapScanCache {
  /**
   * Acquire a tap, reusing the previous result within this run.
   * A failure here is a reachability problem the caller reports as a
   * per-member `tap_error`.
   */
  acquire(tap: TapConfig, home: string): AcquiredTapScan;
  /**
   * Walk a tap's children, memoised. Kept separate from `acquire`
   * because a filesystem error while walking (an unreadable directory,
   * say) is a local fault that must propagate, not be reported as the
   * tap being unreachable.
   */
  children(tap: TapConfig, home: string, rootDir: string): TapChildren;
  /** Full validation (§9 step 4) for one child — a directory, or a gist's skill file — memoised. */
  validate(skillPath: string): CrewError | null;
}

export function makeTapScanCache(): TapScanCache {
  const acquisitions = new Map<string, AcquiredTapScan>();
  const childLists = new Map<string, TapChildren>();
  const validations = new Map<string, CrewError | null>();

  return {
    acquire(tap: TapConfig, home: string): AcquiredTapScan {
      const hit = acquisitions.get(tap.name);
      if (hit) return hit;
      const acquired = acquireTap(tap, home);
      const scan: AcquiredTapScan = {
        rootDir: acquired.rootDir,
        resolvedSha: acquired.resolvedSha,
      };
      acquisitions.set(tap.name, scan);
      return scan;
    },

    children(tap: TapConfig, home: string, rootDir: string): TapChildren {
      const key = JSON.stringify([tap.name, rootDir]);
      const hit = childLists.get(key);
      if (hit) return hit;
      const walked = currentTapChildren(tap, home, rootDir);
      childLists.set(key, walked);
      return walked;
    },

    validate(skillPath: string): CrewError | null {
      const hit = validations.get(skillPath);
      if (hit !== undefined) return hit;
      const result = validationErrorFor(skillPath);
      validations.set(skillPath, result);
      return result;
    },
  };
}

/**
 * Full spec validation (§9 step 4) for a discovered child, returning
 * the failure instead of throwing. `loadSkill` is the same validator
 * the install flow uses.
 *
 * `loadSkill` throws only `CrewError`: `invalid_skill` for the author's
 * mistakes, and `source_unreachable` for a file crew couldn't read — an
 * I/O failure (EACCES, EIO) is reported under that code, naming the
 * file, so it is never blamed on the skill's author.
 */
function validationErrorFor(skillPath: string): CrewError | null {
  try {
    loadSkill(skillPath);
    return null;
  } catch (err) {
    return err as CrewError;
  }
}
