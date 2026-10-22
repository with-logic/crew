/**
 * Marker-index construction for `crew doctor`.
 *
 * Visits every adapter's user base, then every distinct
 * `project_root` in state (plus the current cwd and retained scan
 * candidates) for project-scope markers. A root missing on disk is silently
 * skipped — `checkProjectRoots` already reports it, so reporting
 * again here would be noise.
 *
 * When multiple adapters share an install path (§7.2), the same
 * physical inventory is read once per scope before owner projection.
 * Every logical adapter/root observation retains its lexical paths;
 * records are deduped by `(scope, installDir)`. A base can also serve both scopes
 * (for example when cwd is HOME); the marker owns its scope (§11.1),
 * so an alias reached through the other scope must not relabel it.
 */

import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import type { InstalledSkillRecord } from "../../../agents/adapter.ts";
import { ALL_AGENTS } from "../../../agents/registry.ts";
import type { Scope, StateEntry } from "../../../core/types.ts";
import { hasUsableProjectRoot } from "../../../state/validation.ts";
import type { Finding } from "../findings/index.ts";
import { inventoryDirectory } from "./filesystem.ts";
import { invalidMarkerFinding } from "./findings.ts";
import { createMarkerScanner } from "./scan.ts";

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
): { markers: MarkerEntry[]; findings: Finding[]; projectRoots: readonly string[] } {
  const markers: MarkerEntry[] = [];
  const inventoryFindings = new Map<string, Finding>();
  const seen = new Set<string>();
  const scanMarkers = createMarkerScanner();
  const sameBase = cachedPhysicalBaseComparison();
  // §11.2: a last-entry uninstall must not hide other markers at a previously scanned root.
  const projectRoots = new Set<string>([cwd, ...additionalProjectRoots]);
  for (const e of stateEntries) {
    if (e.scope === "project" && hasUsableProjectRoot(e)) projectRoots.add(e.project_root);
  }
  const roots = [...projectRoots];
  const inventoryRoots = roots.filter((root) => inventoryDirectory(root, inventoryFindings));
  const otherOwningScopeBase = cachedOtherOwningScopeBase(roots, sameBase);
  for (const adapter of ALL_AGENTS) {
    const sharesUserBase = (root: string): boolean =>
      sameBase(adapter.userPath(), adapter.projectPath(root));
    let anySharedBase: boolean | undefined;
    const userInventory = scanMarkers(adapter, "user", cwd);
    for (const [key, finding] of userInventory.findings) inventoryFindings.set(key, finding);
    for (const rec of userInventory.records) {
      if (rec.marker.scope !== "user") {
        anySharedBase ??= roots.some(sharesUserBase);
        if (!(anySharedBase || otherOwningScopeBase(rec)))
          inventoryFindings.set(...scopeMismatchFinding(rec));
        continue;
      }
      const key = `user\0${rec.installDir}`;
      if (seen.has(key)) continue;
      seen.add(key);
      markers.push({ record: rec });
    }
    for (const root of inventoryRoots) {
      const projectInventory = scanMarkers(adapter, "project", root);
      for (const [key, finding] of projectInventory.findings) inventoryFindings.set(key, finding);
      const projectBaseIsShared =
        projectInventory.records.some((rec) => rec.marker.scope !== "project") &&
        sharesUserBase(root);
      for (const rec of projectInventory.records) {
        if (rec.marker.scope !== "project") {
          if (!(projectBaseIsShared || otherOwningScopeBase(rec)))
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
  return { markers, findings: [...inventoryFindings.values()], projectRoots: roots };
}

/** A path-shared marker can acquire its declared scope through another owner (§7.2, §11.2). */
function hasOtherOwningScopeBase(
  record: InstalledSkillRecord,
  roots: readonly string[],
  sameBase: (first: string, second: string) => boolean,
): boolean {
  const observedBase = dirname(record.installDir);
  for (const owner of ALL_AGENTS) {
    if (owner.name === record.adapter || !record.marker.agents.includes(owner.name)) continue;
    const ownsDeclaredBase = {
      user: () => sameBase(observedBase, owner.userPath()),
      project: () => roots.some((root) => sameBase(observedBase, owner.projectPath(root))),
    } satisfies Record<Scope, () => boolean>;
    if (ownsDeclaredBase[record.marker.scope]()) return true;
  }
  return false;
}

/** Resolve aliases only when a mismatched observation needs physical identity (§11.1). */
function samePhysicalBase(first: string, second: string): boolean {
  const nonemptyPaths = first !== "" && second !== "";
  if (!nonemptyPaths) return false;
  const pathsExist = existsSync(first) && existsSync(second);
  if (!pathsExist) return false;
  return realpathSync(first) === realpathSync(second);
}

/** A declared scope cannot authorize reconstruction at a physically distinct base (§11.2). */
function scopeMismatchFinding(record: InstalledSkillRecord): [string, Finding] {
  return invalidMarkerFinding(
    join(record.installDir, ".crew.json"),
    `marker scope ${record.marker.scope} disagrees with its ${record.scope} adapter base; correct the marker or install location before repair`,
  );
}

/** Physical identity is stable only within this inventory build (§11.1). */
function cachedPhysicalBaseComparison(): (first: string, second: string) => boolean {
  const pairs = new Map<string, boolean>();
  return (first, second) => {
    const key = `${first}\0${second}`;
    const cached = pairs.get(key);
    if (cached !== undefined) return cached;
    const same = samePhysicalBase(first, second);
    pairs.set(key, same);
    return same;
  };
}

/** Reuse owner-scope traversal for markers with the same observed inventory identity. */
function cachedOtherOwningScopeBase(
  roots: readonly string[],
  sameBase: (first: string, second: string) => boolean,
): (record: InstalledSkillRecord) => boolean {
  const results = new Map<string, boolean>();
  return (record) => {
    const key = JSON.stringify([
      dirname(record.installDir),
      record.marker.scope,
      record.adapter,
      [...record.marker.agents].sort(),
    ]);
    const cached = results.get(key);
    if (cached !== undefined) return cached;
    const matches = hasOtherOwningScopeBase(record, roots, sameBase);
    results.set(key, matches);
    return matches;
  };
}
