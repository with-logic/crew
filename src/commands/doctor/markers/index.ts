/**
 * Marker-index construction for `crew doctor`.
 *
 * Walks every adapter's user base once, then every distinct
 * `project_root` in state (plus the current cwd and retained scan
 * candidates) for project-scope markers. A root missing on disk is silently
 * skipped — `checkProjectRoots` already reports it, so reporting
 * again here would be noise.
 *
 * When multiple adapters share an install path (§7.2), the same
 * physical marker would be returned by `scanMarkers` once
 * per adapter. We dedupe by `(scope, installDir)` so each marker
 * appears exactly once in the index. A base can also serve both scopes
 * (for example when cwd is HOME); the marker owns its scope (§11.1),
 * so an alias reached through the other scope must not relabel it.
 */

import { existsSync, realpathSync } from "node:fs";
import type { AgentAdapter, InstalledSkillRecord } from "../../../agents/adapter.ts";
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

/**
 * Return deduplicated markers and findings across user and known project inventories.
 * Absent markers add neither result; any emitted finding prevents repair from this inventory.
 */
export function buildMarkerIndex(
  stateEntries: readonly StateEntry[],
  cwd: string,
  additionalProjectRoots: readonly string[] = [],
): { markers: MarkerEntry[]; findings: Finding[] } {
  const markers: MarkerEntry[] = [];
  const inventoryFindings = new Map<string, Finding>();
  const seen = new Set<string>();
  // §11.2: a last-entry uninstall must not hide other markers at a previously scanned root.
  const projectRoots = new Set<string>([cwd, ...additionalProjectRoots]);
  for (const e of stateEntries) {
    if (e.scope === "project" && hasUsableProjectRoot(e)) projectRoots.add(e.project_root);
  }
  const roots = [...projectRoots];
  for (const adapter of ALL_AGENTS) {
    const sharedBases = new Map<string, boolean>();
    const sharesUserBase = (root: string): boolean => {
      const shared = sharedBases.get(root) ?? sharesScopeBase(adapter, root);
      sharedBases.set(root, shared);
      return shared;
    };
    let anySharedBase: boolean | undefined;
    const userInventory = scanMarkers(adapter, "user", cwd);
    for (const [key, finding] of userInventory.findings) inventoryFindings.set(key, finding);
    for (const rec of userInventory.records) {
      if (rec.marker.scope !== "user") {
        anySharedBase ??= roots.some(sharesUserBase);
        if (anySharedBase) continue;
      }
      const key = `user\0${rec.installDir}`;
      if (seen.has(key)) continue;
      seen.add(key);
      markers.push({ record: rec });
    }
    for (const root of roots) {
      if (!existsSync(root)) continue;
      const projectInventory = scanMarkers(adapter, "project", root);
      for (const [key, finding] of projectInventory.findings) inventoryFindings.set(key, finding);
      const projectBaseIsShared =
        projectInventory.records.some((rec) => rec.marker.scope !== "project") &&
        sharesUserBase(root);
      for (const rec of projectInventory.records) {
        if (rec.marker.scope !== "project" && projectBaseIsShared) continue;
        const key = `project\0${rec.installDir}`;
        if (seen.has(key)) continue;
        seen.add(key);
        markers.push({ record: rec, projectRoot: root });
      }
    }
  }
  return { markers, findings: [...inventoryFindings.values()] };
}

/** Scope labels disambiguate only an actual shared physical base (§11.1). */
function sharesScopeBase(adapter: AgentAdapter, root: string): boolean {
  const userBase = adapter.userPath();
  const projectBase = adapter.projectPath(root);
  return (
    userBase !== "" &&
    projectBase !== "" &&
    existsSync(userBase) &&
    existsSync(projectBase) &&
    realpathSync(userBase) === realpathSync(projectBase)
  );
}
