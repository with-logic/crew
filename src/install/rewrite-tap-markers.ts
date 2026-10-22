/**
 * Rewrite installed markers after tap rename or discovery upgrades (§11.1, §16.3, §14).
 *
 * Markers are authoritative for `doctor --repair`, so any tap metadata that
 * affects reconstruction must be copied into existing installed markers.
 */

import { join } from "node:path";
import { type AgentAdapter, baseFor } from "../agents/adapter.ts";
import { listInstalledForAgent } from "../agents/list.ts";
import { ALL_AGENTS } from "../agents/registry.ts";
import type { Marker, Scope, StateEntry, TapDiscovery } from "../core/types.ts";
import { hasUsableProjectRoot } from "../state/validation.ts";
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
  unavailableBases?: ReadonlySet<string>,
): void {
  if (rewrite.oldName === rewrite.newName && rewrite.discovery === undefined) return;
  const projectRoots = new Set<string>([cwd]);
  for (const e of stateEntries) {
    if (e.scope === "project" && hasUsableProjectRoot(e)) projectRoots.add(e.project_root);
  }
  const scan = (adapter: AgentAdapter, scope: Scope, root: string) => {
    if (unavailableBases?.has(baseFor(adapter, scope, root))) return;
    for (const rec of listInstalledForAgent(adapter, scope, root))
      maybeRewrite(rec.installDir, rec.marker, rewrite);
  };
  for (const adapter of ALL_AGENTS) {
    scan(adapter, "user", cwd);
    for (const root of projectRoots) scan(adapter, "project", root);
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
