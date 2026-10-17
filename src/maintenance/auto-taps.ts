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
import { type AgentAdapter, baseFor, cwdForEntry } from "../agents/adapter.ts";
import { readMarkerAt } from "../agents/marker-read.ts";
import { ALL_AGENTS } from "../agents/registry.ts";
import { readConfig, writeConfig } from "../config/load.ts";
import { paths } from "../core/paths.ts";
import { cloneStillReferenced, tapClonePath } from "../core/repo-path.ts";
import type { StateEntry, StateFile } from "../core/types.ts";
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
 * might name a tap can't be read: any in a folder one of an entry's agents
 * installs into, and elsewhere one whose file crew can see. Any other
 * folder crew can't search names nothing.
 */
function scanMarkerTaps(state: StateFile): ReadonlySet<string> | "unreadable" {
  // Settled over all of state first: a folder two entries share (a project
  // root at the user's home, say) is one an entry's agent installs into no
  // matter which entry the scan reaches it from first.
  const agentFolders = new Set<string>();
  for (const entry of state.installations) {
    for (const adapter of ALL_AGENTS) {
      const installDir = installDirOf(entry, adapter);
      if (installDir !== "" && entry.agents.includes(adapter.name)) agentFolders.add(installDir);
    }
  }
  const named = new Set<string>();
  const seen = new Set<string>();
  for (const entry of state.installations) {
    for (const adapter of ALL_AGENTS) {
      const installDir = installDirOf(entry, adapter);
      if (installDir === "" || seen.has(installDir)) continue;
      seen.add(installDir);
      const read = readMarkerAt(installDir);
      if (read.kind === "none") continue;
      if (read.kind === "unreadable") {
        if (agentFolders.has(installDir) || markerFileVisible(installDir)) return "unreadable";
        continue;
      }
      const tap = read.marker.tap_name;
      if (typeof tap === "string") named.add(tap);
    }
  }
  return named;
}

/**
 * `entry`'s install folder in `adapter`; "" where there is none: the
 * adapter has no folder at its scope, or the entry is a project one whose
 * root is missing, relative, or not a string (§11.1), which locates nothing.
 */
function installDirOf(entry: StateEntry, adapter: AgentAdapter): string {
  if (entry.scope === "project" && !hasUsableProjectRoot(entry)) return "";
  const base = baseFor(adapter, entry.scope, cwdForEntry(entry, ""));
  return base === "" ? "" : join(base, entry.name);
}

/**
 * True when crew can see a `.crew.json` there, whether or not it can read
 * it. Outside the folders entries' agents install into, one crew can't
 * see — gone, or in a folder it can't search — names nothing (§16.5).
 */
function markerFileVisible(installDir: string): boolean {
  try {
    lstatSync(join(installDir, ".crew.json"));
    return true;
  } catch {
    return false;
  }
}
