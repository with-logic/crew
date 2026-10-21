/**
 * Per-run tap scan cache (§10.1.1).
 *
 * State entries are grouped by `(tap, scope, project_root)`, so one tap
 * can back several groups — a user install plus two project installs,
 * say. The clone is the same for all of them, so acquiring it, walking
 * its children, and validating each child are identical work repeated
 * per group.
 *
 * This memoises all three for the lifetime of one update run. Clone
 * locks are held across the run (see `sources/tap-lock.ts`), so the
 * snapshot cannot go stale underneath us.
 */

import type { CrewError } from "../../core/errors.ts";
import type { TapConfig } from "../../core/types.ts";
import { loadSkill } from "../../skill/load.ts";
import { acquireTap } from "../../sources/acquire/index.ts";
import { type CurrentTapChild, currentTapChildren } from "../tap-children.ts";

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
   * Walk a tap's children, memoised. Normalized manifest read failures
   * become group `tap_error` rows. Unclassified directory-walk errors
   * still propagate separately from acquisition failures.
   */
  children(tap: TapConfig, home: string, rootDir: string): readonly CurrentTapChild[];
  /** Full validation (§9 step 4) for one child directory, memoised. */
  validate(skillDir: string): CrewError | null;
}

export function makeTapScanCache(): TapScanCache {
  const acquisitions = new Map<string, AcquiredTapScan>();
  const childLists = new Map<string, readonly CurrentTapChild[]>();
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

    children(tap: TapConfig, home: string, rootDir: string): readonly CurrentTapChild[] {
      const key = JSON.stringify([tap.name, rootDir]);
      const hit = childLists.get(key);
      if (hit) return hit;
      const walked = currentTapChildren(tap, home, rootDir);
      childLists.set(key, walked);
      return walked;
    },

    validate(skillDir: string): CrewError | null {
      const hit = validations.get(skillDir);
      if (hit !== undefined) return hit;
      const result = validationErrorFor(skillDir);
      validations.set(skillDir, result);
      return result;
    },
  };
}

/**
 * Full spec validation (§9 step 4) for a discovered child, returning
 * the failure instead of throwing. `loadSkill` is the same validator
 * the install flow uses.
 *
 * `loadSkill` reports validation and source-read failures as `CrewError`,
 * so the cache retains their stable codes without treating I/O as validation.
 */
function validationErrorFor(skillDir: string): CrewError | null {
  try {
    loadSkill(skillDir);
    return null;
  } catch (err) {
    return err as CrewError;
  }
}
