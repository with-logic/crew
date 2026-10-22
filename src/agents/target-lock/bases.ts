/** Derive target bases from trusted adapters and recorded install locations (§7, §11.1, §14). */
import type { Scope, StateEntry } from "../../core/types.ts";
import { hasUsableProjectRoot } from "../../state/validation.ts";
import { type AgentAdapter, baseFor } from "../adapter.ts";
import { ALL_AGENTS, agentByName } from "../registry.ts";
import type { TargetBase } from "./index.ts";

export function adapterTargetBases(
  adapters: readonly AgentAdapter[],
  scope: Scope,
  cwd: string,
  create: boolean,
): TargetBase[] {
  const bases: TargetBase[] = [];
  for (const adapter of adapters) {
    const path = baseFor(adapter, scope, cwd);
    if (path) bases.push({ path, create });
  }
  return bases;
}

export function entryTargetBases(
  entries: readonly StateEntry[],
  fallbackCwd: string,
  create: boolean,
): TargetBase[] {
  const bases: TargetBase[] = [];
  for (const entry of entries) {
    if (entry.scope === "project" && !hasUsableProjectRoot(entry)) continue;
    const cwd = entry.scope === "project" ? entry.project_root! : fallbackCwd;
    for (const name of entry.agents) {
      const adapter = agentByName(name);
      if (adapter) bases.push(...adapterTargetBases([adapter], entry.scope, cwd, create));
    }
  }
  return bases;
}

/** Metadata rewrites inventory every adapter at user scope, cwd and retained project roots. */
export function markerTargetBases(entries: readonly StateEntry[], cwd: string): TargetBase[] {
  const roots = new Set([cwd]);
  for (const entry of entries) {
    if (entry.scope === "project" && hasUsableProjectRoot(entry)) roots.add(entry.project_root);
  }
  const bases = adapterTargetBases(ALL_AGENTS, "user", cwd, false);
  for (const root of roots) bases.push(...adapterTargetBases(ALL_AGENTS, "project", root, false));
  return bases;
}
