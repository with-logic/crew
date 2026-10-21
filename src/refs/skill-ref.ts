/** Raw namespace-qualified skill references (§8, §16.2.1, §16.6). */

export function skillRef(skill: {
  readonly name: string;
  readonly namespace: string | null;
}): string {
  if (skill.namespace === null) return skill.name;
  return `${skill.namespace}/${skill.name}`;
}
