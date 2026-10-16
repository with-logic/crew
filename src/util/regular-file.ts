/**
 * Regular-file test that never follows a symlink (CLAUDE.md design
 * decision #9). A gist's skills are single files (§9 step 5), and a
 * committed link must not stand in for one — following it would read
 * bytes from outside the source.
 */

import { lstatSync } from "node:fs";

/** True iff `path` is a regular file. False for a symlink, directory, or missing path. */
export function isRegularFile(path: string): boolean {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}
