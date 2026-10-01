/**
 * Auto-tap garbage collection (§16.5).
 *
 * Auto taps (`registered: false`) exist only to back state entries crew
 * created them for. Once the last entry attributed to one is gone —
 * uninstalled, or re-attributed to another tap covering the same
 * source — the tap row and its clone are dropped. Registered taps are
 * never collected here; only `crew tap remove` removes those.
 *
 * Shared by `crew uninstall` (entries removed) and `crew install`
 * (entries re-attributed, §5.4).
 */

import { readConfig, writeConfig } from "../config/load.ts";
import { paths } from "../core/paths.ts";
import { cloneStillReferenced, tapClonePath } from "../core/repo-path.ts";
import type { StateFile } from "../core/types.ts";
import { withTapLocks } from "../sources/tap-lock.ts";
import { rmrfInside } from "../util/fs.ts";
import { assertNoSymlinkEscape } from "../util/symlink-containment.ts";

/**
 * Drop every auto tap that no longer backs a state entry. Returns the
 * names collected, so callers can report or assert on them.
 */
export function garbageCollectAutoTaps(state: StateFile, home: string): string[] {
  const config = readConfig(home);
  const inUse = new Set(state.installations.map((e) => e.source.tap));
  const survivors = config.taps.filter((t) => t.registered || inUse.has(t.name));
  if (survivors.length === config.taps.length) return [];
  const removed = config.taps.filter((t) => !survivors.includes(t));
  withTapLocks(removed, home, () => {
    writeConfig({ ...config, taps: survivors }, home);
    const reposDir = paths(home).reposDir;
    for (const tap of removed) {
      if (tap.kind === "git" && !cloneStillReferenced(tap, survivors)) {
        const clone = tapClonePath(tap, home);
        assertNoSymlinkEscape(home, clone, "shared tap clone");
        rmrfInside(reposDir, clone);
      }
      // Path taps own no clone dir; nothing to delete.
    }
  });
  return removed.map((t) => t.name);
}
