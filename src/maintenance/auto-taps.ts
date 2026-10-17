/**
 * Auto-tap garbage collection (§16.5).
 *
 * Auto taps (`registered: false`) exist only to back state entries crew
 * created them for. Once nothing names one — no state entry attributed to
 * it, and no marker at an entry's install folders (a copy a move couldn't
 * relabel, §5.4; markers are authoritative, §11.1) — the tap row and its
 * clone are dropped. Registered taps are never collected here; only
 * `crew tap remove` removes those.
 *
 * Shared by `crew uninstall` (entries removed) and `crew install`
 * (entries re-attributed, §5.4).
 */

import { join } from "node:path";
import { baseFor } from "../agents/adapter.ts";
import { readMarkerAt } from "../agents/marker-read.ts";
import { ALL_AGENTS } from "../agents/registry.ts";
import { readConfig, writeConfig } from "../config/load.ts";
import { paths } from "../core/paths.ts";
import { cloneStillReferenced, tapClonePath } from "../core/repo-path.ts";
import type { StateFile, TapConfig } from "../core/types.ts";
import { withTapLocks } from "../sources/tap-lock.ts";
import { hasUsableProjectRoot } from "../state/validation.ts";
import { rmrfInside } from "../util/fs.ts";
import { assertNoSymlinkEscape } from "../util/symlink-containment.ts";

/**
 * Drop every auto tap nothing names: no state entry is attributed to it,
 * and no crew marker at an entry's install folders names it. A marker crew
 * can't read might name any of them, so while one is found nothing is
 * collected — a leftover tap row is harmless; a marker naming a deleted
 * tap is not. Returns the names collected, so callers can report or assert
 * on them.
 */
export function garbageCollectAutoTaps(state: StateFile, home: string): string[] {
  const config = readConfig(home);
  const inUse = new Set(state.installations.map((e) => e.source.tap));
  const keeps = (t: TapConfig) => t.registered || inUse.has(t.name);
  // Reading every entry's markers is the costly part: skip it when state
  // alone keeps every tap.
  if (config.taps.every(keeps)) return [];
  const markers = tapsNamedByMarkers(state);
  if (markers.unreadable) return [];
  for (const tap of markers.named) inUse.add(tap);
  const survivors = config.taps.filter(keeps);
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

/**
 * The taps the crew markers at `state`'s install folders name, each
 * folder read once (agents share some, §7.2), and whether one couldn't
 * be read.
 */
function tapsNamedByMarkers(state: StateFile): { named: Set<string>; unreadable: boolean } {
  const named = new Set<string>();
  const seen = new Set<string>();
  let unreadable = false;
  for (const entry of state.installations) {
    // §11.1: a missing or relative project root locates nothing.
    if (entry.scope === "project" && !hasUsableProjectRoot(entry)) continue;
    const root = hasUsableProjectRoot(entry) ? entry.project_root : "";
    for (const adapter of ALL_AGENTS) {
      const base = baseFor(adapter, entry.scope, root);
      const installDir = join(base, entry.name);
      if (base === "" || seen.has(installDir)) continue;
      seen.add(installDir);
      const read = readMarkerAt(installDir);
      if (read.kind === "unreadable") unreadable = true;
      if (read.kind === "marker" && typeof read.marker.tap_name === "string") {
        named.add(read.marker.tap_name);
      }
    }
  }
  return { named, unreadable };
}
