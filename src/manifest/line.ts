/**
 * What one line of a project manifest holds (§9.2). The parser and the
 * editor both read lines through this, so they cannot disagree about which
 * lines are references.
 */

/** The reference a manifest line holds, trimmed, or null for a blank line or a `#` comment. */
export function referenceOn(line: string): string | null {
  const ref = line.trim();
  return ref === "" || ref.startsWith("#") ? null : ref;
}
