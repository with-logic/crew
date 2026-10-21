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
 * appears exactly once in the index. A base can also serve both scopes
 * (for example when cwd is HOME); the marker owns its scope (§11.1),
 * so an alias reached through the other scope must not relabel it.
 */

import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AgentAdapter, InstalledSkillRecord } from "../../../agents/adapter.ts";
import { ALL_AGENTS } from "../../../agents/registry.ts";
import type { StateEntry } from "../../../core/types.ts";
import { hasUsableProjectRoot } from "../../../state/validation.ts";
import { redactText, sanitizeLine } from "../../../util/redact.ts";
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
): { markers: MarkerEntry[]; findings: Finding[] } {
  const markers: MarkerEntry[] = [];
  const inventoryFindings = new Map<string, Finding>();
  const seen = new Set<string>();
  const projectRoots = new Set<string>([cwd]);
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
        if (!(anySharedBase || hasOtherOwningScopeBase(rec, roots)))
          inventoryFindings.set(...scopeMismatchFinding(rec));
        continue;
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
        if (rec.marker.scope !== "project") {
          if (!(projectBaseIsShared || hasOtherOwningScopeBase(rec, roots)))
            inventoryFindings.set(...scopeMismatchFinding(rec));
          continue;
        }
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
  return samePhysicalBase(userBase, projectBase);
}

/** A path-shared marker can acquire its declared scope through another owner (§7.2, §11.2). */
function hasOtherOwningScopeBase(record: InstalledSkillRecord, roots: readonly string[]): boolean {
  const observedBase = dirname(record.installDir);
  for (const owner of ALL_AGENTS) {
    if (owner.name === record.adapter || !record.marker.agents.includes(owner.name)) continue;
    if (record.marker.scope === "user") {
      if (samePhysicalBase(observedBase, owner.userPath())) return true;
    } else if (roots.some((root) => samePhysicalBase(observedBase, owner.projectPath(root))))
      return true;
  }
  return false;
}

/** Resolve aliases only when a mismatched observation needs physical identity (§11.1). */
function samePhysicalBase(first: string, second: string): boolean {
  return (
    first !== "" &&
    second !== "" &&
    existsSync(first) &&
    existsSync(second) &&
    realpathSync(first) === realpathSync(second)
  );
}

/** A declared scope cannot authorize reconstruction at a physically distinct base (§11.2). */
function scopeMismatchFinding(record: InstalledSkillRecord): [string, Finding] {
  const path = join(record.installDir, ".crew.json");
  return [
    `marker_invalid\0${path}`,
    {
      level: "error",
      code: "marker_invalid",
      message: sanitizeLine(
        redactText(
          `${path}: marker scope ${record.marker.scope} disagrees with its ${record.scope} adapter base; correct the marker or install location before repair`,
        ),
      ),
    },
  ];
}
