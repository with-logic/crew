/**
 * Topological sort for the install-set (§9 step 6).
 *
 * The install flow needs dependencies to be staged before their
 * dependents so that marker writes, state writes, and adapter copies
 * all see a consistent view. Cycles terminate naturally — §9 permits
 * them — by short-circuiting when a node is already on the visit stack.
 *
 * Edges come from the resolver's `requiredBy` map, which records
 * *resolved* skill names on both ends. A dependency reference's tail
 * need not match the name its `SKILL.md` declares (§9 step 4), so
 * re-deriving edges from raw reference strings would drop exactly
 * those edges and let a dependent install before its dependency.
 */

import type { ResolvedSkill } from "../core/types.ts";

/** name → set of names that depend on it (the resolver's `requiredBy`). */
export type DependentsMap = ReadonlyMap<string, ReadonlySet<string>>;

/** Topological sort: dependency before dependent. */
export function topoSort(
  byName: Map<string, ResolvedSkill>,
  requiredBy: DependentsMap,
): ResolvedSkill[] {
  const out: ResolvedSkill[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const names = [...byName.keys()];
  // Invert `requiredBy` (dep → dependents) into dependent → deps, keeping
  // only names present in this install set.
  const deps = new Map<string, string[]>();
  for (const [depName, dependents] of requiredBy) {
    if (!byName.has(depName)) continue;
    for (const dependent of dependents) {
      if (!byName.has(dependent)) continue;
      const existing = deps.get(dependent);
      if (existing) existing.push(depName);
      else deps.set(dependent, [depName]);
    }
  }

  function visit(name: string): void {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      return; // cycle — terminate naturally per §9 step 6
    }
    visiting.add(name);
    for (const d of deps.get(name) ?? []) {
      visit(d);
    }
    visiting.delete(name);
    visited.add(name);
    out.push(byName.get(name)!);
  }
  for (const name of names) {
    visit(name);
  }
  return out;
}
