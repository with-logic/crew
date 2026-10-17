/**
 * Walking a directory tree without following links (CLAUDE.md design
 * decision #9): content hashing (§12.1), recursive discovery (§9 step
 * 5.4), and cache sizing. A folder crew can't list throws the raw
 * filesystem error, for the caller to classify (`listDir`).
 */

import { lstatSync } from "node:fs";
import { join, relative } from "node:path";
import { isDirectory, listDir, toPosix } from "./fs.ts";

/** Information about an entry discovered during a walk. */
export interface WalkedEntry {
  /** POSIX relative path from the walk root. */
  readonly relPath: string;
  /** Absolute path. */
  readonly absPath: string;
  /** True if a symlink (not followed). */
  readonly isSymlink: boolean;
  /** True if a regular file (and not a symlink). */
  readonly isFile: boolean;
  /** True if a directory (and not a symlink). */
  readonly isDirectory: boolean;
}

/** Options for `walk`. */
export interface WalkOptions {
  /** Whether to descend into a given directory. Called with each directory's relPath. */
  readonly shouldDescend?: (entry: WalkedEntry) => boolean;
  /** Whether to emit a given entry. Defaults to "yes" for everything. */
  readonly shouldEmit?: (entry: WalkedEntry) => boolean;
}

/** Walk a directory tree non-recursively (iterative). Never follows symlinks. */
export function walk(root: string, options: WalkOptions = {}): WalkedEntry[] {
  const results: WalkedEntry[] = [];
  if (!isDirectory(root)) return results;
  const stack: string[] = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const name of listDir(current)) {
      const abs = join(current, name);
      const rel = toPosix(relative(root, abs));
      const lst = lstatSync(abs);
      const entry: WalkedEntry = {
        relPath: rel,
        absPath: abs,
        isSymlink: lst.isSymbolicLink(),
        isFile: lst.isFile() && !lst.isSymbolicLink(),
        isDirectory: lst.isDirectory() && !lst.isSymbolicLink(),
      };
      if (!options.shouldEmit || options.shouldEmit(entry)) results.push(entry);
      if (entry.isDirectory && (!options.shouldDescend || options.shouldDescend(entry)))
        stack.push(abs);
    }
  }
  return results;
}
