/** Source file reads preserve operational failures before validation or staging (§9, §13). */

import { accessSync, constants } from "node:fs";
import { hashDirectory } from "../hash/content.ts";
import { copyTree } from "../util/copy.ts";
import { readBytes } from "../util/fs.ts";
import { readSourceFile, sourceReadFailure } from "../util/source-read.ts";

/** Hash an acquired source; target and store hashing retain their existing error behavior. */
export function hashSourceDirectory(path: string): string {
  return hashDirectory(path, (file) => readSourceFile(file, readBytes));
}

/** Copy an acquired source, distinguishing source permissions from destination failures. */
export function copySourceTree(source: string, destination: string): void {
  try {
    copyTree(source, destination, { stripRootMarker: true });
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.syscall !== "copyfile") throw err;
    // copyfile reports the source in `path` even when the destination write failed.
    const path = error.path!;
    try {
      accessSync(path, constants.R_OK);
    } catch (readError) {
      throw sourceReadFailure(path, readError);
    }
    throw err;
  }
}
