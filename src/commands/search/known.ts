/**
 * Known-tap fallback search for `crew search` (§16.2.1 / §16.6).
 */

import type { TapConfig } from "../../core/types.ts";
import { knownTapIsConfigured } from "../../known-taps/configured.ts";
import { knownTapSource } from "../../known-taps/format.ts";
import { searchKnownTaps } from "../../known-taps/search.ts";
import type { KnownSearchHit } from "./types.ts";

export function collectKnownHits(
  query: string,
  configuredTaps: readonly TapConfig[],
): readonly KnownSearchHit[] {
  if (query.trim() === "") return [];
  const hits: KnownSearchHit[] = [];
  for (const hit of searchKnownTaps(query)) {
    if (knownTapIsConfigured(hit.tap, configuredTaps)) continue;
    hits.push({
      tap: hit.tap.name,
      url: hit.tap.url,
      subpath: hit.tap.subpath,
      trust: hit.tap.trust,
      name: hit.skill.name,
      namespace: hit.skill.namespace,
      description: hit.skill.description,
    });
  }
  return hits;
}

export function knownInstallRef(hit: KnownSearchHit): string {
  return `${hit.tap}/${knownSkillRef(hit)}`;
}

export function knownSkillRef(hit: KnownSearchHit): string {
  if (hit.namespace === null) return hit.name;
  return `${hit.namespace}/${hit.name}`;
}

export { knownTapSource };
