/**
 * Auto-tap garbage collection (§16.5).
 *
 * Auto taps (`registered: false`) exist only to back state entries crew
 * created them for. Once nothing names one — no state entry attributed to
 * it, and no marker in an entry's install folders (a copy a move couldn't
 * relabel, §5.4; markers are authoritative, §11.1) — the tap row and its
 * clone are dropped. Registered taps are never collected here; only
 * `crew tap remove` removes those.
 *
 * Shared by `crew uninstall` (entries removed) and `crew install`
 * (entries re-attributed, §5.4).
 */

import { lstatSync } from "node:fs";
import { join } from "node:path";
import { baseFor, cwdForEntry } from "../agents/adapter.ts";
import { readMarkerAt } from "../agents/marker-read.ts";
import { ALL_AGENTS } from "../agents/registry.ts";
import { readConfig, writeConfig } from "../config/load.ts";
import { paths } from "../core/paths.ts";
import { cloneStillReferenced, tapClonePath } from "../core/repo-path.ts";
import type { StateFile } from "../core/types.ts";
import { withTapLocks } from "../sources/tap-lock.ts";
import { hasUsableProjectRoot } from "../state/validation.ts";
import { rmrfInside } from "../util/fs.ts";
import { assertNoSymlinkEscape } from "../util/symlink-containment.ts";

/**
 * Drop every auto tap nothing names: no state entry is attributed to it,
 * and no crew marker in an entry's install folders, in any agent, names
 * it. A marker crew can't read might name any of them, so while one is
 * found nothing is collected: a leftover tap row is harmless; a marker
 * naming a deleted tap is not. Returns the names collected, so callers can
 * report or assert on them.
 */
export function garbageCollectAutoTaps(state: StateFile, home: string): string[] {
  const config = readConfig(home);
  const attributed = new Set(state.installations.map((e) => e.source.tap));
  const candidates = config.taps.filter((t) => !(t.registered || attributed.has(t.name)));
  // Reading the entries' markers is the costly part: skip it when nothing would go.
  if (candidates.length === 0) return [];
  const named = scanMarkerTaps(state);
  if (named === "unreadable") return [];
  const removed = candidates.filter((t) => !named.has(t.name));
  if (removed.length === 0) return [];
  const survivors = config.taps.filter((t) => !removed.includes(t));
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
 * The taps the crew markers in `state`'s entries' install folders name —
 * in every agent, so a copy state doesn't list counts too; each folder read
 * once (agents share some, §7.2) — or "unreadable" as soon as one that
 * might name a tap can't be read: any in a folder of the entry's own
 * agents, and elsewhere one whose file is there. A folder crew can't
 * search, of an agent the entry isn't installed in, names nothing.
 */
function scanMarkerTaps(state: StateFile): ReadonlySet<string> | "unreadable" {
  const named = new Set<string>();
  const seen = new Set<string>();
  for (const entry of state.installations) {
    // §11.1: a missing, relative, or non-string project root locates nothing.
    if (entry.scope === "project" && !hasUsableProjectRoot(entry)) continue;
    const root = cwdForEntry(entry, "");
    const own = new Set(entry.agents);
    // The entry's own agents first, so a folder they share is read as theirs.
    const adapters = [...ALL_AGENTS].sort(
      (a, b) => Number(own.has(b.name)) - Number(own.has(a.name)),
    );
    for (const adapter of adapters) {
      const base = baseFor(adapter, entry.scope, root);
      if (base === "") continue;
      const installDir = join(base, entry.name);
      if (seen.has(installDir)) continue;
      seen.add(installDir);
      const read = readMarkerAt(installDir);
      if (read.kind === "none") continue;
      if (read.kind === "unreadable") {
        if (own.has(adapter.name) || markerFileExists(installDir)) return "unreadable";
        continue;
      }
      const tap = read.marker.tap_name;
      if (typeof tap === "string") named.add(tap);
    }
  }
  return named;
}

/** True when a `.crew.json` is there, whether or not crew can read it. */
function markerFileExists(installDir: string): boolean {
  try {
    lstatSync(join(installDir, ".crew.json"));
    return true;
  } catch {
    return false;
  }
}
