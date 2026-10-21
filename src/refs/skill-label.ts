/** Raw namespace-qualified skill labels (§8, §16.2.1, §16.6). */

export function skillLabel(skill: {
  readonly name: string;
  readonly namespace: string | null;
}): string {
  if (skill.namespace === null) return skill.name;
  return `${skill.namespace}/${skill.name}`;
}
