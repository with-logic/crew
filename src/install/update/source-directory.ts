/** Distinguish a vanished recorded path from local I/O failures during update (§10.1). */

import { statSync } from "node:fs";

/** Follow path-source links, treating an unresolvable directory as source_gone. */
export function sourceDirectoryExists(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR" || code === "ELOOP") return false;
    throw err;
  }
}
