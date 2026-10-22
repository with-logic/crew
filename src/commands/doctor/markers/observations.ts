/** Project a physical snapshot onto every logical adapter/base observation (§7.2, §11.2). */
import { join, relative } from "node:path";
import type { InstalledSkillRecord } from "../../../agents/adapter.ts";
import type { Scope } from "../../../core/types.ts";
import type { Finding } from "../findings/index.ts";
import { inventoryProblemFinding } from "./findings.ts";
import type { PhysicalMarkerInventory } from "./physical.ts";

export interface ObservedMarkerInventory {
  readonly records: InstalledSkillRecord[];
  readonly findings: Map<string, Finding>;
}

/** Findings precede owner membership; alias paths never replace lexical install identity. */
export function projectMarkerInventory(
  inventory: PhysicalMarkerInventory,
  adapter: string,
  scope: Scope,
  base: string,
): ObservedMarkerInventory {
  const records: InstalledSkillRecord[] = [];
  const findings = new Map<string, Finding>();
  for (const problem of inventory.problems) {
    const path =
      problem.path === inventory.base ? base : join(base, relative(inventory.base, problem.path));
    findings.set(...inventoryProblemFinding(problem, path));
  }
  for (const { name, marker } of inventory.markers) {
    if (marker.agents.includes(adapter))
      records.push({ adapter, scope, installDir: join(base, name), marker });
  }
  return { records, findings };
}
