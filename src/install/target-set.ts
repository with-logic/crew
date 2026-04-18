/**
 * Determine the active set of target adapters for an install operation
 * (§9 step 7).
 *
 *   1. Start with every adapter whose `detect()` returns true OR that
 *      appears in `config.forced_targets`.
 *   2. Remove any listed in `config.disabled_targets`.
 *   3. Restrict to `--target` adapters if any were supplied.
 *   4. If the set is empty, throw `no_targets` (exit 4).
 */

import { CrewError } from "../core/errors.ts";
import type { Config } from "../core/types.ts";
import type { TargetAdapter } from "../targets/adapter.ts";
import { ALL_ADAPTERS, adapterByName } from "../targets/registry.ts";

/** Compute the active set of target adapters. */
export function computeTargetSet(config: Config, restrictTo: readonly string[] = []): TargetAdapter[] {
  const unknown = restrictTo.filter((n) => !adapterByName(n));
  if (unknown.length > 0) {
    throw new CrewError("no_targets", `unknown target(s): ${unknown.join(", ")}`, { unknown });
  }

  let active: TargetAdapter[] = [];
  for (const adapter of ALL_ADAPTERS) {
    const forced = config.forced_targets.includes(adapter.name);
    const detected = adapter.detect();
    if (!forced && !detected) continue;
    if (config.disabled_targets.includes(adapter.name)) continue;
    active.push(adapter);
  }
  if (restrictTo.length > 0) {
    const set = new Set(restrictTo);
    active = active.filter((a) => set.has(a.name));
  }
  if (active.length === 0) {
    throw new CrewError("no_targets", "no agent targets are active; run `crew targets` to check");
  }
  return active;
}
