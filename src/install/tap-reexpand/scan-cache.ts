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

import { CrewError } from "../../core/errors.ts";
import type { TapConfig } from "../../core/types.ts";
import { loadSkill } from "../../skill/load.ts";
import { acquireTap } from "../../sources/acquire/index.ts";
import { isGistTap } from "../../sources/gist.ts";
import { isSourceReadFailure } from "../../util/source-read.ts";
import { type CurrentTapCatalog, currentTapChildren } from "../tap-children.ts";

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
   * Walk a tap's children, memoising results and normalized source-read failures
   * that become group `tap_error` rows, including directory discovery failures.
   */
  children(tap: TapConfig, home: string, rootDir: string): CurrentTapCatalog;
  /** Load and validate one child (§9 step 4), memoising validation and source-read errors. */
  validate(skillDir: string, tap?: TapConfig): CrewError | null;
}

export function makeTapScanCache(): TapScanCache {
  const acquisitions = new Map<string, AcquiredTapScan>();
  const childScans = new Map<string, CurrentTapCatalog | CrewError>();
  const skillLoadErrors = new Map<string, CrewError | null>();

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

    children(tap: TapConfig, home: string, rootDir: string): CurrentTapCatalog {
      const key = JSON.stringify([tap.name, rootDir]);
      const hit = childScans.get(key);
      if (hit instanceof CrewError) throw hit;
      if (hit) return hit;
      try {
        const walked = currentTapChildren(tap, home, rootDir);
        childScans.set(key, walked);
        return walked;
      } catch (err) {
        if (isSourceReadFailure(err)) childScans.set(key, err);
        throw err;
      }
    },

    validate(skillDir: string, tap?: TapConfig): CrewError | null {
      const hit = skillLoadErrors.get(skillDir);
      if (hit !== undefined) return hit;
      const skillLoadError = skillLoadErrorFor(skillDir, tap !== undefined && isGistTap(tap));
      skillLoadErrors.set(skillDir, skillLoadError);
      return skillLoadError;
    },
  };
}

/**
 * Load and validate a discovered child (§9 step 4), returning expected
 * skill-load failures. `loadSkill` is the same loader the install flow uses.
 *
 * Cache stable `CrewError` codes for validation and source-read failures;
 * unexpected errors from manifest path inspection must still propagate.
 */
function skillLoadErrorFor(skillDir: string, file: boolean): CrewError | null {
  try {
    loadSkill(skillDir, file);
    return null;
  } catch (err) {
    if (err instanceof CrewError) return err;
    throw err;
  }
}
