/**
 * Taking back a failed tap child's copies (§10.1.1 step 2; C-UPD-18e).
 * Each folder this run installed the child into is removed, unless it
 * no longer holds what this run wrote there — its marker or its content
 * (§12.1) changed, someone's edit made between installing it and the
 * failure — or crew can't remove it. Either is left in place and named
 * in the child's failure, which keeps its own code.
 */

import { readMarkerAt } from "../../agents/marker-read.ts";
import { hashDirectory } from "../../hash/content.ts";
import { removeEach } from "../../util/cleanup.ts";

/** A folder this run installed the child into, and what it wrote there. */
export interface ChildCopy {
  readonly dest: string;
  readonly name: string;
  readonly contentHash: string;
}

/** Remove each of `copies` still as this run wrote it; the ones left, as `` `dest` (why) ``. */
export function takeBackCopies(copies: readonly ChildCopy[]): string[] {
  const left: string[] = [];
  const removable: string[] = [];
  for (const copy of copies) {
    if (stillAsWritten(copy)) removable.push(copy.dest);
    else left.push(`\`${copy.dest}\` (crew can't confirm it still holds what this run installed)`);
  }
  return [...left, ...removeEach(removable)];
}

/** True when `copy`'s marker and content are what this run wrote. */
function stillAsWritten(copy: ChildCopy): boolean {
  const read = readMarkerAt(copy.dest);
  return (
    read.kind === "marker" &&
    read.marker.name === copy.name &&
    read.marker.content_hash === copy.contentHash &&
    contentHashOf(copy.dest) === copy.contentHash
  );
}

/** `dir`'s content hash (§12.1), or null when crew can't read all of it. */
function contentHashOf(dir: string): string | null {
  try {
    return hashDirectory(dir);
  } catch {
    return null;
  }
}
