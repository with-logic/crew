/**
 * Whether the current user can read a path — for telling which side of
 * a copy failed (§9 step 8): a source file crew can still read wasn't
 * what broke.
 */

import { accessSync, constants } from "node:fs";

/** True when `path` exists and the current user can read it. */
export function isReadable(path: string): boolean {
  try {
    accessSync(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
