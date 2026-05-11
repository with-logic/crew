/**
 * Topological sort for the install-set (§9 step 6).
 *
 * The install flow needs dependencies to be staged before their
 * dependents so that marker writes, state writes, and adapter copies
 * all see a consistent view. Cycles terminate naturally — §9 permits
 * them — by short-circuiting when a node is already on the visit stack.
 */

import type { ResolvedSkill } from "../core/types.ts";
import { NAME_PATTERN } from "../refs/parse.ts";

/** Topological sort: dependency before dependent. */
export function topoSort(byName: Map<string, ResolvedSkill>): ResolvedSkill[] {
  const out: ResolvedSkill[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const names = [...byName.keys()];
  const deps = new Map<string, string[]>();
  for (const name of names) {
    const skill = byName.get(name)!;
    const depList = skill.frontmatter.metadata?.crew?.dependencies ?? [];
    deps.set(
      name,
      depList.map((d) => extractDepName(d)).filter((n): n is string => n !== null && byName.has(n)),
    );
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

/**
 * Extract a best-guess dependency name from a reference string. Used only
 * to disambiguate when a directory-source expansion returns multiple
 * candidate skills. An indeterminate name returns `null`, which the
 * caller handles by falling back to the first candidate.
 */
export function extractDepName(ref: string): string | null {
  const trimmed = ref.trim();
  // Bare tap name or `tap/name` (both may have an `@ref` tail).
  const bareOrQualified = trimmed.split("@")[0]!;
  const tail = bareOrQualified.split("/").pop() ?? "";
  if (NAME_PATTERN.test(tail)) return tail;
  return null;
}
