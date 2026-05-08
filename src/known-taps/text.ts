/**
 * Shared known-tap text comparison helpers (§16.2.1).
 */

export function sameText(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function sameNullableText(a: string | null, b: string | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return sameText(a, b);
}
