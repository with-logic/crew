/**
 * Editing a project manifest's text (§9.2): adding and removing reference
 * lines while leaving every other line, comments and blank lines included,
 * exactly as it was.
 *
 * Text in, text out. Nothing here reads a file or judges whether a
 * reference is one a manifest may hold; `parseManifest` does that for the
 * result.
 */

import { CrewError } from "../core/errors.ts";
import { referenceOn } from "./line.ts";

/** A manifest's text after an edit, and the references the edit acted on. */
export interface ManifestEdit {
  readonly text: string;
  /** The references added or removed, trimmed, in the order given, each once. */
  readonly changedRefs: readonly string[];
}

/**
 * The references to act on: each trimmed, each once, in the order given.
 * One that is empty or spans lines is a `usage_error`. Parsing the edited
 * manifest could not catch it, because it would read as no line or as
 * several valid ones.
 */
function singleLineRefs(refs: readonly string[]): string[] {
  const unique = new Set<string>();
  for (const raw of refs) {
    const ref = raw.trim();
    if (ref === "" || /[\r\n]/.test(ref)) {
      throw new CrewError("usage_error", "a skill reference must be one non-empty line");
    }
    unique.add(ref);
  }
  return [...unique];
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
  const changedRefs = singleLineRefs(refs).filter((ref) => !present.has(ref));
  if (changedRefs.length === 0) return { text, changedRefs };
  const start = text === "" || text.endsWith("\n") ? text : `${text}\n`;
  return { text: `${start}${changedRefs.join("\n")}\n`, changedRefs };
}

/**
 * Delete the line of each of `refs` the manifest lists. A reference it does
 * not list is left out of `changedRefs`; the caller decides whether that is
 * an error. Every line that stays keeps its text and its line ending.
 */
export function removeManifestLines(text: string, refs: readonly string[]): ManifestEdit {
  const wanted = singleLineRefs(refs);
  const found = new Set<string>();
  const lines = text.split("\n");
  const kept: string[] = [];
  for (const [index, line] of lines.entries()) {
    const ref = referenceOn(line);
    if (ref === null || !wanted.includes(ref)) {
      kept.push(line);
      continue;
    }
    found.add(ref);
    // A removed last line that had no newline of its own: the line before
    // it had one, which rejoining would otherwise drop.
    const isUnterminatedLastLine = index === lines.length - 1;
    if (isUnterminatedLastLine) kept.push("");
  }
  const changedRefs = wanted.filter((ref) => found.has(ref));
  return { text: changedRefs.length === 0 ? text : kept.join("\n"), changedRefs };
}
