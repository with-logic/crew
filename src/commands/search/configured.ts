/**
 * Configured-tap search for `crew search` (§16.6).
 */

import type { TapConfig } from "../../core/types.ts";
import { indexTap } from "../../install/tap-index.ts";
import { loadSkill } from "../../skill/load.ts";
import type { ConfiguredSearchResult, SearchHit } from "./types.ts";

export function collectConfiguredHits(
  taps: readonly TapConfig[],
  query: string,
  installedNames: ReadonlySet<string>,
  home: string,
): ConfiguredSearchResult {
  const hits: SearchHit[] = [];
  const warnings: string[] = [];
  for (const tap of taps) collectHitsFromTap(tap, query, installedNames, home, hits, warnings);
  hits.sort(compareSearchHits);
  return { hits, warnings };
}

function collectHitsFromTap(
  tap: TapConfig,
  query: string,
  installedNames: ReadonlySet<string>,
  home: string,
  hits: SearchHit[],
  warnings: string[],
): void {
  let index: ReturnType<typeof indexTap>;
  try {
    index = indexTap(tap, home);
  } catch {
    warnings.push(
      `warning: tap \`${tap.name}\` isn't cloned yet and couldn't be reached — skipping. run \`crew tap update ${tap.name}\` when you're back online.`,
    );
    return;
  }
  for (const locs of index.skills.values()) {
    for (const loc of locs) collectSkillHit(tap, loc, query, installedNames, hits);
  }
}

function collectSkillHit(
  tap: TapConfig,
  loc: { readonly namespace: string | null; readonly path: string },
  query: string,
  installedNames: ReadonlySet<string>,
  hits: SearchHit[],
): void {
  try {
    const skill = loadSkill(loc.path);
    const { name, description } = skill.frontmatter;
    if (!matchesSkill(name, description, query)) return;
    hits.push({
      tap: tap.name,
      name,
      namespace: loc.namespace,
      description,
      installed: installedNames.has(name),
    });
  } catch {
    // Invalid skill directories in a tap are silently ignored —
    // an unparseable SKILL.md isn't a search-time error.
  }
}

function matchesSkill(name: string, description: string, query: string): boolean {
  return (
    query === "" || name.toLowerCase().includes(query) || description.toLowerCase().includes(query)
  );
}

function compareSearchHits(a: SearchHit, b: SearchHit): number {
  if (a.tap !== b.tap) return a.tap.localeCompare(b.tap);
  return a.name.localeCompare(b.name);
}
