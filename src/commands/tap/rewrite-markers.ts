/**
 * Rewrite every on-disk marker whose `tap_name` equals the old name to
 * carry the new name instead.
 *
 * Called after a `crew tap add` against the same URL/path as an
 * existing auto tap, when the user passes a new explicit name. The
 * tap's identity on disk moves (config, state.installations[].source.tap,
 * clone dir), and markers — which are the ground truth for doctor
 * --repair — must follow.
 *
 * We walk every adapter, both scopes, every known project root, read
 * each marker, and rewrite the file in place when the name matches.
 * Markers for other taps are untouched.
 */

import { join } from "node:path";
import { listInstalledForAgent } from "../../agents/list.ts";
import { ALL_AGENTS } from "../../agents/registry.ts";
import type { Marker, StateEntry } from "../../core/types.ts";
import { writeJson } from "../../util/json.ts";

export function rewriteMarkerTapName(
  oldName: string,
  newName: string,
  stateEntries: readonly StateEntry[],
  cwd: string,
): void {
  if (oldName === newName) return;
  const projectRoots = new Set<string>([cwd]);
  for (const e of stateEntries) {
    if (e.scope === "project" && e.project_root) projectRoots.add(e.project_root);
  }
  for (const adapter of ALL_AGENTS) {
    for (const rec of listInstalledForAgent(adapter, "user", cwd)) {
      maybeRewrite(rec.installDir, rec.marker, oldName, newName);
    }
    for (const root of projectRoots) {
      for (const rec of listInstalledForAgent(adapter, "project", root)) {
        maybeRewrite(rec.installDir, rec.marker, oldName, newName);
      }
    }
  }
}

function maybeRewrite(installDir: string, marker: Marker, oldName: string, newName: string): void {
  if (marker.tap_name !== oldName) return;
  writeJson(join(installDir, ".crew.json"), { ...marker, tap_name: newName });
}
