/** Native source locations recorded with POSIX separators (§9 step 5, §11.1). */

import { relative, sep } from "node:path";
import { CrewError } from "../core/errors.ts";

/** Validate persisted spelling without changing literal POSIX filename characters (§7.5). */
export function assertRecordedSourcePath(path: string): void {
  if (path.startsWith("/") || path.includes("\0") || path.split("/").includes(".."))
    throw new CrewError(
      "invalid_skill",
      "recorded skill path must be source-relative without parent components or NUL",
      { path },
    );
}

/** A backslash in a POSIX filename is literal, never a source path separator. */
export function sourceRelativePath(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}
