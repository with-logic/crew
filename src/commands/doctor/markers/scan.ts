/** Build-local physical marker snapshots precede every logical ownership projection (§11.2). */
import { type AgentAdapter, baseFor } from "../../../agents/adapter.ts";
import type { Scope } from "../../../core/types.ts";
import { inspectInventoryDirectory } from "./filesystem.ts";
import type { InventoryProblem } from "./findings.ts";
import { type ObservedMarkerInventory, projectMarkerInventory } from "./observations.ts";
import { type PhysicalMarkerInventory, readPhysicalMarkerInventory } from "./physical.ts";

type MarkerScanner = (adapter: AgentAdapter, scope: Scope, cwd: string) => ObservedMarkerInventory;

/** A fresh scanner per build keeps locked repair independent from initial marker snapshots. */
export function createMarkerScanner(): MarkerScanner {
  const inventories = new Map<string, PhysicalMarkerInventory>();
  return (adapter, scope, cwd) => {
    const base = baseFor(adapter, scope, cwd);
    const problems: InventoryProblem[] = [];
    const empty = { base, markers: [], problems };
    if (base === "") return projectMarkerInventory(empty, adapter.name, scope, base);
    // Reuse strict stat identity; each lexical alias still proves its own search access.
    const entry = inspectInventoryDirectory(base, problems);
    if (!entry) return projectMarkerInventory(empty, adapter.name, scope, base);
    const key = `${scope}\0${entry.dev}\0${entry.ino}`;
    let inventory = inventories.get(key);
    if (!inventory) {
      inventory = readPhysicalMarkerInventory(base);
      inventories.set(key, inventory);
    }
    return projectMarkerInventory(inventory, adapter.name, scope, base);
  };
}

/** Standalone scans retain their existing one-adapter contract and fresh inventory lifetime. */
export function scanMarkers(
  adapter: AgentAdapter,
  scope: Scope,
  cwd: string,
): ObservedMarkerInventory {
  return createMarkerScanner()(adapter, scope, cwd);
}
