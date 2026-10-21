/** Native source locations recorded with POSIX separators (§9 step 5, §11.1). */

import { relative, sep } from "node:path";

/** A backslash in a POSIX filename is literal, never a source path separator. */
export function sourceRelativePath(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}
