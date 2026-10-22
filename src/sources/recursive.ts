/**
 * Recursive skill discovery helpers (§9 step 5.4).
 *
 * Standard tap expansion is deterministic and shallow. Recursive
 * discovery is an explicit fallback for trusted repositories whose
 * skills are nested under project-specific folders.
 */

import { basename } from "node:path";
import { hasSkillMd } from "../skill/load.ts";
import type { WalkedEntry } from "../util/fs.ts";
import type { GitDiscoveryWarnings } from "./discovery.ts";
import { sourceRelativePath } from "./path.ts";
import { assertSourceDirectorySearchable, walkSourceDirectory } from "./read.ts";

const MAX_RECURSIVE_DEPTH = 5;
const SKIPPED_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  ".crew",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "coverage",
  ".next",
]);

/** Return skill directories discovered recursively, in deterministic order. */
export function findRecursiveSkillDirs(
  rootDir: string,
  discovery?: GitDiscoveryWarnings,
): string[] {
  const dirs: string[] = [];
  for (const entry of walkSourceDirectory(rootDir, {
    shouldEmit: (entry) => {
      if (entry.isSymlink && !shouldSkipDirectory(entry.absPath)) discovery?.recordSkippedSymlink();
      return true;
    },
    shouldDescend: (entry) => shouldDescendInto(entry, rootDir),
  })) {
    if (!entry.isDirectory) continue;
    if (shouldSkipDirectory(entry.absPath)) continue;
    if (!hasSkillMd(entry.absPath)) continue;
    dirs.push(entry.absPath);
  }
  dirs.sort();
  return dirs;
}

function shouldDescendInto(entry: WalkedEntry, rootDir: string): boolean {
  if (shouldSkipDirectory(entry.absPath)) return false;
  // Empty readable directories can still deny search permission (§9, §13).
  assertSourceDirectorySearchable(entry.absPath);
  // Refuse to descend into depth-5 dirs so emitted entries are bounded at depth 5 (§9 step 5.4).
  if (depthOf(sourceRelativePath(rootDir, entry.absPath)) >= MAX_RECURSIVE_DEPTH) return false;
  return !hasSkillMd(entry.absPath);
}

function shouldSkipDirectory(path: string): boolean {
  const name = basename(path);
  if (name.startsWith(".")) return true;
  return SKIPPED_DIRS.has(name);
}

function depthOf(relPath: string): number {
  return relPath.split("/").length;
}
