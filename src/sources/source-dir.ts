/**
 * Listing a folder of a source (§9 step 5; C-SPEC-18). One crew can't
 * list is the local filesystem's fault, reported as `source_unreachable`
 * naming it — never a raw filesystem error, and never blamed on the
 * skill's author. An agent's folder or crew's store keeps its raw error,
 * so its failure reports the errno code (`listDir`).
 */

import { unreadablePathError } from "../util/errno.ts";
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
