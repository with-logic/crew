/**
 * Removing a failed tap child's copies (§10.1.1 step 2; C-UPD-18e).
 * Each folder this run installed the child into is removed, unless it
 * no longer holds what this run wrote there — its marker, byte for byte,
 * or its content (§12.1) changed: someone's edit made between installing
 * it and the failure — or crew can't remove it. Either is left in place
 * and named in the child's failure, which keeps its own code.
 *
 * A copy is claimed before it is checked: moved aside to a name no skill
 * can have (a leading dot, §9 step 4), so an edit made through its path
 * can't land between the check and the removal. A changed one is moved
 * back.
 */

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { hashDirectory } from "../../hash/content.ts";
import { removeEach } from "../../util/cleanup.ts";
import { errnoReason } from "../../util/errno.ts";

/** A folder this run installed the child into, and what it wrote there. */
export interface ChildCopy {
  readonly dest: string;
  readonly contentHash: string;
  /** The marker's bytes as this run wrote them. */
  readonly markerText: string;
}

/** Remove each of `copies` still as this run wrote it; the ones left, as `` `path` (why) ``. */
export function removeChildCopies(copies: readonly ChildCopy[]): string[] {
  const left: string[] = [];
  for (const copy of copies) left.push(...removeChildCopy(copy));
  return left;
}

/** Remove `copy` if it is still as this run wrote it; what was left, if anything. */
function removeChildCopy(copy: ChildCopy): string[] {
  const claimed = join(dirname(copy.dest), `.crew-removing-${basename(copy.dest)}-${randomUUID()}`);
  const unclaimed = moveOrWhy(copy.dest, claimed);
  if (unclaimed !== null) return [`\`${copy.dest}\` (crew couldn't remove it — ${unclaimed})`];
  if (stillAsWritten(copy, claimed)) return removeEach([claimed]);
  // Someone's edit: back where it was, unless something else is there now.
  const restored = !existsSync(copy.dest) && moveOrWhy(claimed, copy.dest) === null;
  return [
    `\`${restored ? copy.dest : claimed}\` (crew can't confirm it still holds what this run installed)`,
  ];
}

/** Move `from` to `to`; why not, when crew couldn't. */
function moveOrWhy(from: string, to: string): string | null {
  try {
    renameSync(from, to);
    return null;
  } catch (err) {
    return errnoReason(err);
  }
}

/** True when the copy claimed at `at` holds the marker and content this run wrote. */
function stillAsWritten(copy: ChildCopy, at: string): boolean {
  return markerTextAt(at) === copy.markerText && contentHashOf(at) === copy.contentHash;
}

/** The marker's bytes in `dir`, or null when crew can't read them. */
function markerTextAt(dir: string): string | null {
  try {
    return readFileSync(join(dir, ".crew.json"), "utf8");
  } catch {
    return null;
  }
}

/** `dir`'s content hash (§12.1), or null when crew can't read all of it. */
function contentHashOf(dir: string): string | null {
  try {
    return hashDirectory(dir);
  } catch {
    return null;
  }
}
