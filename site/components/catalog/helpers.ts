import type { SkillCatalogTap } from "../../lib/generated/skillCatalog";

export interface VisibleTap {
  readonly tap: SkillCatalogTap;
  readonly skills: readonly SkillCatalogTap["skills"][number][];
}

export function filterTaps(taps: readonly SkillCatalogTap[], query: string): readonly VisibleTap[] {
  const normalized = query.trim().toLowerCase();
  const out: VisibleTap[] = [];
  for (const tap of taps) {
    const tapMatches = normalized.length === 0 || textMatches(tapText(tap), normalized);
    const skills = tapMatches
      ? tap.skills
      : tap.skills.filter((skill) => textMatches(skillText(skill), normalized));
    if (tapMatches || skills.length > 0) out.push({ tap, skills });
  }
  return out;
}

export function tapRef(tap: SkillCatalogTap): string {
  return tap.sourceRef;
}

export function installSkillCommand(
  tap: SkillCatalogTap,
  skill: SkillCatalogTap["skills"][number],
): string {
  if (tap.source === "default") return `crew install ${skillLabel(skill)}`;
  return `crew install ${tap.name}/${skillLabel(skill)}`;
}

export function skillLabel(skill: SkillCatalogTap["skills"][number]): string {
  return skill.namespace === null ? skill.name : `${skill.namespace}/${skill.name}`;
}

function textMatches(text: string, query: string): boolean {
  return text.toLowerCase().includes(query);
}

function tapText(tap: SkillCatalogTap): string {
  return `${tap.name} ${tap.description} ${tap.url}`;
}

function skillText(skill: SkillCatalogTap["skills"][number]): string {
  return `${skill.name} ${skill.namespace ?? ""} ${skill.description}`;
}
