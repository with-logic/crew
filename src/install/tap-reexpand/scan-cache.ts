/**
 * Per-run tap scan cache (§10.1.1).
 *
 * State entries are grouped by `(tap, scope, project_root, ref)`.
 * This cache reuses no-ref/path acquisition by tap name, child walks by
 * `(tap.name, rootDir)`, and validation by source path across groups.
 *
 * Git revision outcomes are prepared once per `(tap.name, ref)` before
 * target locks, but each ref-based group gets its own scratch export,
 * child walk, and validation. Clone locks protect the shared checkout
 * throughout the run (see `sources/tap-lock.ts`).
 */

import { CrewError } from "../../core/errors.ts";
import type { TapConfig } from "../../core/types.ts";
import { loadSkill } from "../../skill/load.ts";
import { acquireTap } from "../../sources/acquire/index.ts";
import type { PreparedSources } from "../../sources/acquire/revision.ts";
import type { GitDiscoveryWarnings } from "../../sources/discovery.ts";
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
  validate(sourcePath: string, tap?: TapConfig): CrewError | null;
}

export function makeTapScanCache(
  prepared?: PreparedSources,
  discovery?: GitDiscoveryWarnings,
): TapScanCache {
  const acquisitions = new Map<string, AcquiredTapScan>();
  const childScans = new Map<string, CurrentTapCatalog | CrewError>();
  const skillLoadErrors = new Map<string, CrewError | null>();

  return {
    acquire(tap: TapConfig, home: string): AcquiredTapScan {
      const hit = acquisitions.get(tap.name);
      if (hit) return hit;
      const acquired = acquireTap(tap, home, prepared);
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
        const walked = currentTapChildren(tap, home, rootDir, discovery);
        childScans.set(key, walked);
        return walked;
      } catch (err) {
        if (isSourceReadFailure(err)) childScans.set(key, err);
        throw err;
      }
    },

    validate(sourcePath: string, tap?: TapConfig): CrewError | null {
      const hit = skillLoadErrors.get(sourcePath);
      if (hit !== undefined) return hit;
      const skillLoadError = skillLoadErrorFor(sourcePath, tap !== undefined && isGistTap(tap));
      skillLoadErrors.set(sourcePath, skillLoadError);
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
function skillLoadErrorFor(sourcePath: string, isGistFile: boolean): CrewError | null {
  try {
    loadSkill(sourcePath, isGistFile);
    return null;
  } catch (err) {
    if (err instanceof CrewError) return err;
    throw err;
  }
}
