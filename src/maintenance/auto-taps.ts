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
import { paths, tapPath } from "../core/paths.ts";
import type { StateFile } from "../core/types.ts";
import { rmrfInside } from "../util/fs.ts";

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
  writeConfig({ ...config, taps: survivors }, home);
  const tapsDir = paths(home).tapsDir;
  for (const tap of removed) {
    // A tap name reaches us from `config.yaml`, so the clone path is
    // built from persisted text. Refuse anything that resolves outside
    // the taps directory rather than handing it to a recursive delete.
    if (tap.kind === "git") rmrfInside(tapsDir, tapPath(tap.name, home));
    // Path taps own no clone dir; nothing to delete.
  }
  return removed.map((t) => t.name);
}
