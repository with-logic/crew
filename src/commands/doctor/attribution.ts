/**
 * Doctor's check 10 (§11.2; C-STATE-05b): each marker names the tap and
 * path its state entry is attributed to. A marker that disagrees — a copy
 * a move couldn't relabel (§5.4), say — is reported, not repaired: the
 * entry's other copies name the tap state records, so re-pointing state
 * at this one would move them too. Reinstalling the copy with `--force`
 * brings it in line.
 */

import type { StateEntry } from "../../core/types.ts";
import type { Finding } from "./checks.ts";
import type { MarkerEntry } from "./markers.ts";

/** One `marker_tap_drift` finding per marker whose tap or path its state entry doesn't share. */
export function checkMarkerAttribution(
  stateEntries: readonly StateEntry[],
  markers: readonly MarkerEntry[],
): Finding[] {
  const findings: Finding[] = [];
  for (const m of markers) {
    const marker = m.record.marker;
    // A marker no entry owns is check 2's.
    const entry = stateEntries.find(
      (e) =>
        e.name === marker.name &&
        e.scope === m.record.scope &&
        (e.project_root ?? null) === (m.projectRoot ?? null) &&
        e.agents.some((a) => marker.agents.includes(a)),
    );
    if (entry === undefined) continue;
    if (marker.tap_name === entry.source.tap && marker.path === entry.source.path) continue;
    findings.push({
      level: "warn",
      code: "marker_tap_drift",
      message: `\`${m.record.installDir}\` names ${where(marker.tap_name, marker.path)}, but crew's records put ${entry.name} on ${where(entry.source.tap, entry.source.path)}; reinstall that copy with \`--force\` to bring it in line`,
    });
  }
  return findings;
}

/** A tap and a skill's path in it, as a message names them. */
function where(tap: string, path: string): string {
  return path === "" ? `tap \`${tap}\`` : `tap \`${tap}\` at \`${path}\``;
}
