/**
 * Search helpers for the bundled known-tap registry (§16.2.1).
 */

import { KNOWN_TAPS } from "./registry.ts";
import type { KnownTap, KnownTapHit, KnownTapSkill } from "./types.ts";

export function searchKnownTaps(
  query: string,
  registry: readonly KnownTap[] = KNOWN_TAPS,
): readonly KnownTapHit[] {
  const normalized = query.trim().toLowerCase();
  const hits: KnownTapHit[] = [];
  for (const tap of registry) {
    const tapMatches = knownTapMatches(tap, normalized);
    for (const skill of tap.skills) {
      if (tapMatches || knownTapSkillMatches(skill, normalized)) hits.push({ tap, skill });
    }
  }
  hits.sort(compareKnownTapHits);
  return hits;
}

export function findKnownTapByName(
  name: string,
  registry: readonly KnownTap[] = KNOWN_TAPS,
): KnownTap | null {
  for (const tap of registry) {
    if (tap.name === name) return tap;
  }
  return null;
}

export function findKnownTapSkill(
  tap: KnownTap,
  name: string,
  namespace: string | null = null,
): KnownTapSkill | null {
  for (const skill of tap.skills) {
    if (skill.name === name && skill.namespace === namespace) return skill;
  }
  return null;
}

export function knownTapSkillLabel(skill: KnownTapSkill): string {
  if (skill.namespace === null) return skill.name;
  return `${skill.namespace}/${skill.name}`;
}

function knownTapMatches(tap: KnownTap, query: string): boolean {
  return (
    query === "" ||
    tap.name.toLowerCase().includes(query) ||
    tap.description.toLowerCase().includes(query)
  );
}

function knownTapSkillMatches(skill: KnownTapSkill, query: string): boolean {
  const label = knownTapSkillLabel(skill).toLowerCase();
  return query === "" || skill.description.toLowerCase().includes(query) || label.includes(query);
}

function compareKnownTapHits(a: KnownTapHit, b: KnownTapHit): number {
  if (a.tap.name !== b.tap.name) return a.tap.name.localeCompare(b.tap.name);
  return knownTapSkillLabel(a.skill).localeCompare(knownTapSkillLabel(b.skill));
}
