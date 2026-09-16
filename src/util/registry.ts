/**
 * Safe lookups in object-literal registries keyed by user input.
 *
 * Crew keys several registries — command handlers, aliases, help pages,
 * per-subcommand flag tables — by a word taken straight from argv. A
 * plain object resolves inherited members, so `crew __proto__`,
 * `crew constructor`, and `crew toString` retrieve prototype values and
 * get treated as real entries: the alias table hands back an object with
 * no `.slice`, and the help registry hands back one with no `.summary`,
 * both of which surface as "crew hit an unexpected error" with a
 * bug-report link rather than the normal unknown-command message.
 *
 * `lookup` returns a value only for an own key, so a prototype-named
 * word is simply absent and callers take their existing not-found path.
 */

/** The value at `key`, or undefined unless the registry owns that key. */
export function lookup<T>(registry: Readonly<Record<string, T>>, key: string): T | undefined {
  if (!Object.hasOwn(registry, key)) return undefined;
  return registry[key];
}
