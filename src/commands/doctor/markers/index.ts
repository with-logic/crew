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
 * physical marker would be returned by `scanMarkers` once
 * per adapter. We dedupe by `(scope, installDir)` so each marker
 * appears exactly once in the index.
 */

import { existsSync } from "node:fs";
import type { InstalledSkillRecord } from "../../../agents/adapter.ts";
import { ALL_AGENTS } from "../../../agents/registry.ts";
import type { StateEntry } from "../../../core/types.ts";
import { hasUsableProjectRoot } from "../../../state/validation.ts";
import type { Finding } from "../checks.ts";
import { scanMarkers } from "./scan.ts";

export interface MarkerEntry {
  record: InstalledSkillRecord;
  currentHash?: string;
  /** For project-scope markers, the cwd we walked from — used as `project_root` during --repair. */
  projectRoot?: string;
}

export function buildMarkerIndex(
  stateEntries: readonly StateEntry[],
  cwd: string,
): { markers: MarkerEntry[]; findings: Finding[] } {
  const markers: MarkerEntry[] = [];
  const inventoryFindings = new Map<string, Finding>();
  const seen = new Set<string>();
  const projectRoots = new Set<string>([cwd]);
  for (const e of stateEntries) {
    if (e.scope === "project" && hasUsableProjectRoot(e)) projectRoots.add(e.project_root);
  }
  for (const adapter of ALL_AGENTS) {
    const userInventory = scanMarkers(adapter, "user", cwd);
    for (const [key, finding] of userInventory.findings) inventoryFindings.set(key, finding);
    for (const rec of userInventory.records) {
      const key = `user\0${rec.installDir}`;
      if (seen.has(key)) continue;
      seen.add(key);
      markers.push({ record: rec });
    }
    for (const root of projectRoots) {
      if (!existsSync(root)) continue;
      const projectInventory = scanMarkers(adapter, "project", root);
      for (const [key, finding] of projectInventory.findings) inventoryFindings.set(key, finding);
      for (const rec of projectInventory.records) {
        const key = `project\0${rec.installDir}`;
        if (seen.has(key)) continue;
        seen.add(key);
        markers.push({ record: rec, projectRoot: root });
      }
    }
  }
  return { markers, findings: [...inventoryFindings.values()] };
}
