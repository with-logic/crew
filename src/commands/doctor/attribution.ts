/**
 * Doctor's check 10 (§11.2; C-STATE-05b): each marker names the tap and
 * path its state entry is attributed to. A marker that disagrees — a copy
 * a move couldn't relabel (§5.4), say — is reported, not repaired: the
 * entry's other copies name the tap state records, so re-pointing state
 * at this one would move them too. Reinstalling the copy with `--force`
 * brings a copy on another tap in line. One on the entry's own tap at
 * another path took a relocated skill (§10.1) whose update failed
 * elsewhere, and `crew update <name>` retries it — or was left behind (an
 * update skipped it as customized), and the reinstall brings it in line.
 */

import type { Scope, StateEntry } from "../../core/types.ts";
import type { Finding } from "./checks.ts";
import { type MarkerEntry, ownsInstall } from "./markers.ts";

/** One `marker_attribution_drift` finding per marker whose tap or path its state entry doesn't share. */
export function checkMarkerAttribution(
  stateEntries: readonly StateEntry[],
  markers: readonly MarkerEntry[],
): Finding[] {
  const findings: Finding[] = [];
  // State's entries by location, in state order, so each marker looks at
  // only the entries there instead of all of state.
  const byLocation = new Map<string, StateEntry[]>();
  for (const e of stateEntries) {
    const key = locationKey(e.name, e.scope, e.project_root ?? null);
    const here = byLocation.get(key);
    if (here) here.push(e);
    else byLocation.set(key, [e]);
  }
  for (const m of markers) {
    const marker = m.record.marker;
    const here = byLocation.get(locationKey(marker.name, m.record.scope, m.projectRoot ?? null));
    // A marker no entry owns is check 2's.
    const entry = here?.find((e) => ownsInstall(e, m));
    if (entry === undefined) continue;
    if (marker.tap_name === entry.source.tap && marker.path === entry.source.path) continue;
    // Only the path differs: a copy ahead of state (a relocation whose
    // update failed elsewhere) follows on retry; one behind it (skipped as
    // customized) is reinstalled.
    const next =
      marker.tap_name === entry.source.tap
        ? `run \`crew update ${entry.name}\` (if it reports the skill up to date, reinstall that copy with \`--force\`)`
        : "reinstall that copy with `--force`";
    findings.push({
      level: "warn",
      code: "marker_attribution_drift",
      message: `\`${m.record.installDir}\` names ${tapLocationLabel(marker.tap_name, marker.path)}, but crew's records put ${entry.name} on ${tapLocationLabel(entry.source.tap, entry.source.path)}; ${next} to bring it in line`,
    });
  }
  return findings;
}

/** An install's location — skill, scope, project root (`sameInstall`) — as one map key. */
function locationKey(name: string, scope: Scope, projectRoot: string | null): string {
  return JSON.stringify([name, scope, projectRoot]);
}

/** A tap and a skill's path in it, as a message names them. */
function tapLocationLabel(tap: string, path: string): string {
  return path === "" ? `tap \`${tap}\`` : `tap \`${tap}\` at \`${path}\``;
}
