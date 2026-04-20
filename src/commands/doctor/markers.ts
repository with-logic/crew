/**
 * Marker-index construction for `crew doctor`.
 *
 * Walks every adapter's user base once, then every distinct
 * `project_root` in state (plus the current cwd) for project-scope
 * markers. A `project_root` that doesn't exist on disk is silently
 * skipped — `checkProjectRoots` already reports it, so reporting
 * again here would be noise.
 *
 * When multiple adapters share an install path (§7.2), the same
 * physical marker would be returned by `listInstalledForTarget` once
 * per adapter. We dedupe by `(scope, installDir)` so each marker
 * appears exactly once in the index.
 */

import { existsSync } from "node:fs";
import type { StateEntry } from "../../core/types.ts";
import { listInstalledForTarget } from "../../targets/list.ts";
import { ALL_ADAPTERS } from "../../targets/registry.ts";

export interface MarkerEntry {
  record: ReturnType<typeof listInstalledForTarget>[number];
  currentHash?: string;
  /** For project-scope markers, the cwd we walked from — used as `project_root` during --repair. */
  projectRoot?: string;
}

export function buildMarkerIndex(stateEntries: readonly StateEntry[], cwd: string): MarkerEntry[] {
  const markers: MarkerEntry[] = [];
  const seen = new Set<string>();
  const projectRoots = new Set<string>([cwd]);
  for (const e of stateEntries) {
    if (e.scope === "project" && e.project_root) projectRoots.add(e.project_root);
  }
  for (const adapter of ALL_ADAPTERS) {
    for (const rec of listInstalledForTarget(adapter, "user", cwd)) {
      const key = `user\0${rec.installDir}`;
      if (seen.has(key)) continue;
      seen.add(key);
      markers.push({ record: rec });
    }
    for (const root of projectRoots) {
      if (!existsSync(root)) continue;
      for (const rec of listInstalledForTarget(adapter, "project", root)) {
        const key = `project\0${rec.installDir}`;
        if (seen.has(key)) continue;
        seen.add(key);
        markers.push({ record: rec, projectRoot: root });
      }
    }
  }
  return markers;
}
