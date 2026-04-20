/**
 * Version-check file I/O + staleness gate (§10.4).
 *
 * Keeps a small JSON record at `~/.crew/version-check.json` that says
 * "the last time we queried GitHub for the latest crew tag, here's what
 * we got." Main-thread command execution reads this file to decide
 * whether to emit the update notice. A separate background subprocess
 * writes the file after a network fetch.
 *
 * The main thread never does network I/O for this — crew exits fast.
 */

import { crewHome, paths } from "../core/paths.ts";
import { CREW_VERSION } from "../core/version.ts";
import { tryReadJson, writeJson } from "../util/json.ts";
import { nowIso } from "../util/time.ts";

/** Shape of `version-check.json`. */
export interface VersionCheckRecord {
  readonly checked_at: string;
  readonly latest_tag: string;
}

/** How often the background check is allowed to run. */
export const VERSION_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Read the record if present. Returns `null` on absent/malformed. */
export function readVersionCheck(home: string = crewHome()): VersionCheckRecord | null {
  return tryReadJson<VersionCheckRecord>(paths(home).versionCheckFile);
}

/** Overwrite the record with `checked_at = now` and the given tag. */
export function writeVersionCheck(latestTag: string, home: string = crewHome()): void {
  const record: VersionCheckRecord = { checked_at: nowIso(), latest_tag: latestTag };
  writeJson(paths(home).versionCheckFile, record);
}

/**
 * Has it been long enough since the last check to warrant kicking off
 * another? Missing file = yes (first run).
 */
export function isStale(
  now: Date,
  record: VersionCheckRecord | null,
  intervalMs: number = VERSION_CHECK_INTERVAL_MS,
): boolean {
  if (!record) return true;
  const then = Date.parse(record.checked_at);
  if (Number.isNaN(then)) return true;
  return now.getTime() - then >= intervalMs;
}

/**
 * The notice emitted to stderr when a newer version is on disk.
 * Returns `null` when the record doesn't indicate a newer version.
 */
export function noticeFor(record: VersionCheckRecord | null): string | null {
  if (!record) return null;
  if (!record.latest_tag) return null;
  const current = `v${CREW_VERSION}`;
  if (normalizeTag(record.latest_tag) === normalizeTag(current)) return null;
  return `A new version of crew is available (${current} → ${record.latest_tag}). Run \`crew self-update\` to upgrade.`;
}

/** Strip a leading `v` so `v0.4.0` and `0.4.0` compare equal. */
function normalizeTag(tag: string): string {
  return tag.startsWith("v") ? tag.slice(1) : tag;
}
