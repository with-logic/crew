/**
 * The namespace a skill's location in its tap gives it (§9 step 5 case 2,
 * §8.3): `skills/<ns>/<name>` is the one layout with a namespace. Shared
 * by the tap index, re-expansion, reference resolution, selection, and the
 * known-taps build, so they can't disagree about which skills a namespace
 * holds.
 */

/** `<ns>` for `skills/<ns>/<name>`; null for any other location, a recursive find's included. */
export function namespaceOf(tapRelativePath: string): string | null {
  const parts = tapRelativePath.split("/");
  return parts.length === 3 && parts[0] === "skills" ? parts[1]! : null;
}
