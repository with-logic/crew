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
import { ALL_AGENTS } from "../agents/registry.ts";
import { readConfig, writeConfig } from "../config/load.ts";
import { paths } from "../core/paths.ts";
import { cloneStillReferenced, tapClonePath } from "../core/repo-path.ts";
import type { Marker, StateFile } from "../core/types.ts";
import { withTapLocks } from "../sources/tap-lock.ts";
import { rmrfInside } from "../util/fs.ts";
import { tryReadJson } from "../util/json.ts";
import { assertNoSymlinkEscape } from "../util/symlink-containment.ts";

/**
 * Drop every auto tap that backs no state entry, isn't named by a marker
 * at an entry's install folders, and isn't in `stillNamed` (taps a marker
 * crew couldn't read still names). Returns the names collected, so
 * callers can report or assert on them.
 */
export function garbageCollectAutoTaps(
  state: StateFile,
  home: string,
  stillNamed: ReadonlySet<string> = new Set(),
): string[] {
  const config = readConfig(home);
  const inUse = new Set([...state.installations.map((e) => e.source.tap), ...stillNamed]);
  if (config.taps.every((t) => t.registered || inUse.has(t.name))) return [];
  for (const tap of tapsNamedByMarkers(state)) inUse.add(tap);
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

/** The taps the crew markers at `state`'s install folders name, in every agent. */
function tapsNamedByMarkers(state: StateFile): Set<string> {
  const named = new Set<string>();
  for (const entry of state.installations) {
    // A project entry with no recorded root has no folder to look in.
    if (entry.scope === "project" && !entry.project_root) continue;
    for (const adapter of ALL_AGENTS) {
      const base = baseFor(adapter, entry.scope, entry.project_root ?? "");
      if (base === "") continue;
      const tap = markerTapAt(join(base, entry.name));
      if (tap !== null) named.add(tap);
    }
  }
  return named;
}

/** The tap the marker in `installDir` names; null when there is none crew can read. */
function markerTapAt(installDir: string): string | null {
  try {
    const marker = tryReadJson<Marker>(join(installDir, ".crew.json"));
    return typeof marker?.tap_name === "string" ? marker.tap_name : null;
  } catch {
    return null;
  }
}
