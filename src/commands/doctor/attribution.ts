/**
 * Doctor's check 10 (§11.2; C-STATE-05b): each marker names the tap and
 * path its state entry is attributed to. A marker that disagrees — a copy
 * a move couldn't relabel (§5.4), say — is reported, not repaired: the
 * entry's other copies name the tap state records, so re-pointing state
 * at this one would move them too. Reinstalling the copy with `--force`
 * brings a copy on another tap in line; one on the entry's own tap at
 * another path took a relocated skill (§10.1) whose update failed
 * elsewhere, and `crew update <name>` retries it.
 */

import type { StateEntry } from "../../core/types.ts";
import type { Finding } from "./checks.ts";
import { type MarkerEntry, ownsInstall } from "./markers.ts";

/** One `marker_attribution_drift` finding per marker whose tap or path its state entry doesn't share. */
export function checkMarkerAttribution(
  stateEntries: readonly StateEntry[],
  markers: readonly MarkerEntry[],
): Finding[] {
  const findings: Finding[] = [];
  for (const m of markers) {
    const marker = m.record.marker;
    // A marker no entry owns is check 2's.
    const entry = stateEntries.find((e) => ownsInstall(e, m));
    if (entry === undefined) continue;
    if (marker.tap_name === entry.source.tap && marker.path === entry.source.path) continue;
    const next =
      marker.tap_name === entry.source.tap
        ? `run \`crew update ${entry.name}\``
        : "reinstall that copy with `--force`";
    findings.push({
      level: "warn",
      code: "marker_attribution_drift",
      message: `\`${m.record.installDir}\` names ${tapLocationLabel(marker.tap_name, marker.path)}, but crew's records put ${entry.name} on ${tapLocationLabel(entry.source.tap, entry.source.path)}; ${next} to bring it in line`,
    });
  }
  return findings;
}

/** A tap and a skill's path in it, as a message names them. */
function tapLocationLabel(tap: string, path: string): string {
  return path === "" ? `tap \`${tap}\`` : `tap \`${tap}\` at \`${path}\``;
}
