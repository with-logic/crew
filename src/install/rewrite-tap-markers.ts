/**
 * Rewrite installed markers after tap rename or discovery upgrades (§11.1, §16.3).
 *
 * Markers are authoritative for `doctor --repair`, so any tap metadata that
 * affects reconstruction must be copied into existing installed markers.
 */

import { join } from "node:path";
import { listInstalledForAgent } from "../agents/list.ts";
import { ALL_AGENTS } from "../agents/registry.ts";
import type { Marker, StateEntry, TapDiscovery } from "../core/types.ts";
import { writeJson } from "../util/json.ts";

export interface TapMarkerRewrite {
  readonly oldName: string;
  readonly newName: string;
  readonly discovery?: TapDiscovery;
}

export function rewriteTapMarkers(
  rewrite: TapMarkerRewrite,
  stateEntries: readonly StateEntry[],
  cwd: string,
): void {
  if (rewrite.oldName === rewrite.newName && rewrite.discovery === undefined) return;
  const projectRoots = new Set<string>([cwd]);
  for (const e of stateEntries) {
    if (e.scope === "project" && e.project_root) projectRoots.add(e.project_root);
  }
  for (const adapter of ALL_AGENTS) {
    for (const rec of listInstalledForAgent(adapter, "user", cwd)) {
      maybeRewrite(rec.installDir, rec.marker, rewrite);
    }
    for (const root of projectRoots) {
      for (const rec of listInstalledForAgent(adapter, "project", root)) {
        maybeRewrite(rec.installDir, rec.marker, rewrite);
      }
    }
  }
}

function maybeRewrite(installDir: string, marker: Marker, rewrite: TapMarkerRewrite): void {
  if (marker.tap_name !== rewrite.oldName) return;
  writeJson(join(installDir, ".crew.json"), {
    ...marker,
    tap_name: rewrite.newName,
    ...(rewrite.discovery === "recursive" ? { tap_discovery: "recursive" } : {}),
  });
}
