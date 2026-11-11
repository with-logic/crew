/**
 * Editing a project manifest's text (§9.2): adding and removing reference
 * lines while leaving every other line, comments and blank lines included,
 * exactly as it was.
 *
 * Text in, text out. Nothing here reads a file or judges whether a
 * reference is one a manifest may hold; `parseManifest` does that for the
 * result.
 */

/** A manifest's text after an edit, and the references the edit acted on. */
export interface ManifestEdit {
  readonly text: string;
  /** The references added or removed, in the order given, each once. */
  readonly changed: readonly string[];
}

/** The reference a line holds, or null for a blank line or a comment. */
function referenceOn(line: string): string | null {
  const ref = line.trim();
  return ref === "" || ref.startsWith("#") ? null : ref;
}

/**
 * Append each of `refs` as its own line, skipping any the manifest already
 * lists. The result ends with a newline; lines are added after the last
 * existing line, which gains a newline first if it lacked one.
 */
export function addManifestLines(text: string, refs: readonly string[]): ManifestEdit {
  const present = new Set<string>();
  for (const line of text.split("\n")) {
    const ref = referenceOn(line);
    if (ref !== null) present.add(ref);
  }
  const changed: string[] = [];
  for (const raw of refs) {
    const ref = raw.trim();
    if (present.has(ref)) continue;
    present.add(ref);
    changed.push(ref);
  }
  if (changed.length === 0) return { text, changed };
  const start = text === "" || text.endsWith("\n") ? text : `${text}\n`;
  return { text: `${start}${changed.join("\n")}\n`, changed };
}

/**
 * Delete the line of each of `refs` the manifest lists. A reference it does
 * not list is left out of `changed`; the caller decides whether that is an
 * error. Every other line keeps its text and its line ending, and what is
 * left ends with a newline.
 */
export function removeManifestLines(text: string, refs: readonly string[]): ManifestEdit {
  const wanted = new Set(refs.map((ref) => ref.trim()));
  const found = new Set<string>();
  const kept: string[] = [];
  for (const line of text.split("\n")) {
    const ref = referenceOn(line);
    if (ref !== null && wanted.has(ref)) found.add(ref);
    else kept.push(line);
  }
  const changed: string[] = [];
  for (const ref of wanted) {
    if (found.has(ref)) changed.push(ref);
  }
  if (changed.length === 0) return { text, changed };
  // Removing a last line that had no newline leaves the line before it last.
  const rest = kept.join("\n");
  return { text: rest === "" || rest.endsWith("\n") ? rest : `${rest}\n`, changed };
}
