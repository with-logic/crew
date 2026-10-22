/** Install metadata plans and complete trusted target sets before mutation (§5.4, §14). */
import type { AgentAdapter } from "../agents/adapter.ts";
import { ALL_AGENTS } from "../agents/registry.ts";
import { adapterTargetBases, markerTargetBases } from "../agents/target-lock/bases.ts";
import type { Config, Scope, StateEntry } from "../core/types.ts";
import type { Reattribution } from "./duplicate-rules/index.ts";
import type { TapMarkerRewrite } from "./rewrite-tap-markers.ts";

export function discoveryUpgrades(before: Config, after: Config): TapMarkerRewrite[] {
  const previous = new Map(before.taps.map((tap) => [tap.name, tap]));
  const rewrites: TapMarkerRewrite[] = [];
  for (const tap of after.taps) {
    const old = previous.get(tap.name);
    if (old && old.discovery !== "recursive" && tap.discovery === "recursive")
      rewrites.push({ oldName: tap.name, newName: tap.name, discovery: "recursive" });
  }
  return rewrites;
}

export function installTargetBases(
  agents: readonly AgentAdapter[],
  scope: Scope,
  cwd: string,
  rewrites: readonly TapMarkerRewrite[],
  reattributions: readonly Reattribution[],
  entries: readonly StateEntry[],
) {
  const bases = adapterTargetBases(agents, scope, cwd, true);
  if (rewrites.length > 0) bases.push(...markerTargetBases(entries, cwd));
  for (const move of reattributions) {
    if (move.scope === "project" && move.projectRoot === null) continue;
    bases.push(...adapterTargetBases(ALL_AGENTS, move.scope, move.projectRoot ?? cwd, false));
  }
  return bases;
}
