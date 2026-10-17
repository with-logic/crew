/**
 * Listing a folder of a source (§9 step 5; C-SPEC-18). One crew can't
 * list is the local filesystem's fault, reported as `source_unreachable`
 * naming it — never a raw filesystem error, and never blamed on the
 * skill's author. An agent's folder or crew's store keeps its raw error,
 * so its failure reports the errno code (`listDir`).
 */

import { accessSync, constants, statSync } from "node:fs";
import { isGoneError, unreadablePathError } from "../util/errno.ts";
import { listDir } from "../util/fs.ts";

/**
 * The names in source folder `dir` (`[]` when it isn't a folder);
 * `source_unreachable` naming it when crew can't list it.
 */
export function listSourceDir(dir: string): string[] {
  try {
    return listDir(dir);
  } catch (err) {
    throw unreadablePathError(dir, err, "read");
  }
}

/**
 * Whether `path` in a source is a folder: false when nothing usable is
 * there (gone, §10.1) or it is something else; `source_unreachable`
 * naming it when crew can't look — never taken for no folder at all.
 */
export function isSourceDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch (err) {
    if (isGoneError(err)) return false;
    throw unreadablePathError(path, err);
  }
}

/**
 * `source_unreachable` naming source folder `dir` when crew can list it
 * but not look anything up in it: each entry would read as nothing at
 * all, and the folder as empty.
 */
export function assertSourceDirSearchable(dir: string): void {
  try {
    accessSync(dir, constants.X_OK);
  } catch (err) {
    throw unreadablePathError(dir, err);
  }
}
