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
import { installDirOf } from "../agents/adapter.ts";
import { readMarkerAt } from "../agents/marker-read.ts";
import { ALL_AGENTS } from "../agents/registry.ts";
import { readConfig, writeConfig } from "../config/load.ts";
import { paths } from "../core/paths.ts";
import { cloneStillReferenced, tapClonePath } from "../core/repo-path.ts";
import type { StateFile } from "../core/types.ts";
import { withTapLocks } from "../sources/tap-lock.ts";
import { rmrfInside } from "../util/fs.ts";
import { safePath, sanitizeLine } from "../util/redact.ts";
import { assertNoSymlinkEscape } from "../util/symlink-containment.ts";

/**
 * What a collection did: the auto taps it dropped (none, when nothing
 * would go), or the marker crew couldn't read, so it kept every auto tap
 * that would have gone.
 */
export type AutoTapCollection =
  | { readonly kind: "collected"; readonly taps: readonly string[] }
  | { readonly kind: "withheld"; readonly markerPath: string; readonly kept: readonly string[] };

const NOTHING_COLLECTED: AutoTapCollection = { kind: "collected", taps: [] };

/**
 * Drop every auto tap nothing names: no state entry is attributed to it,
 * and no crew marker in an entry's install folders, in any agent, names
 * it. A marker crew can't read might name any of them, so while one is
 * found nothing is collected: a leftover tap row is harmless; a marker
 * naming a deleted tap is not. Returns what it did, so callers can report
 * it (`collectionWarnings`) or assert on it.
 */
export function garbageCollectAutoTaps(state: StateFile, home: string): AutoTapCollection {
  const config = readConfig(home);
  const attributed = new Set(state.installations.map((e) => e.source.tap));
  const candidates = config.taps.filter((t) => !(t.registered || attributed.has(t.name)));
  // Reading the entries' markers is the costly part: skip it when nothing would go.
  if (candidates.length === 0) return NOTHING_COLLECTED;
  const named = scanMarkerTaps(state);
  if ("unreadable" in named) {
    const kept = candidates.map((t) => t.name);
    return { kind: "withheld", markerPath: named.unreadable, kept };
  }
  const removed = candidates.filter((t) => !named.has(t.name));
  if (removed.length === 0) return NOTHING_COLLECTED;
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
  return { kind: "collected", taps: removed.map((t) => t.name) };
}

/**
 * The stderr warning a withheld collection gets (§16.5): which taps stay,
 * why, and what collects them once crew can read the marker. Install
 * collects only after a re-attribution, so it points at uninstall. The
 * marker's path and the tap names are escaped (§5.2): a folder's name, or
 * a hand-edited tap name, may hold control characters.
 */
export function collectionWarnings(collection: AutoTapCollection): string[] {
  if (collection.kind === "collected") return [];
  const { kept, markerPath } = collection;
  const one = kept.length === 1;
  const taps = kept.map((name) => `\`${sanitizeLine(name)}\``).join(", ");
  const [tapNoun, pronoun, removedPhrase] = one
    ? ["auto tap", "it", "a tap"]
    : ["auto taps", "them", "the taps"];
  return [
    `warning: kept ${tapNoun} ${taps}: crew can't read \`${safePath(markerPath)}\`, which might still name ${pronoun}. Check its permissions (and its folder's); once crew can read it, a later \`crew uninstall\` removes ${removedPhrase} nothing names.`,
  ];
}

/**
 * The taps the crew markers in `state`'s entries' install folders name —
 * in every agent, so a copy state doesn't list counts too; each folder read
 * once (agents share some, §7.2) — or the first marker that might name a
 * tap and can't be read: any in a folder one of an entry's agents
 * installs into, and elsewhere one whose file crew can see. Any other
 * folder crew can't search names nothing.
 */
function scanMarkerTaps(state: StateFile): ReadonlySet<string> | { readonly unreadable: string } {
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
        if (agentFolders.has(installDir) || markerFileVisible(installDir))
          return { unreadable: join(installDir, ".crew.json") };
        continue;
      }
      const tap = read.marker.tap_name;
      if (typeof tap === "string") named.add(tap);
    }
  }
  return named;
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
