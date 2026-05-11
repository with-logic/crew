/**
 * Recursive skill discovery helpers (§9 step 5.4).
 *
 * Standard tap expansion is deterministic and shallow. Recursive
 * discovery is an explicit fallback for trusted repositories whose
 * skills are nested under project-specific folders.
 */

import { basename } from "node:path";
import { hasSkillMd } from "../skill/load.ts";
import { type WalkedEntry, walk } from "../util/fs.ts";

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
export function findRecursiveSkillDirs(rootDir: string): string[] {
  const dirs: string[] = [];
  for (const entry of walk(rootDir, { shouldDescend: shouldDescendInto })) {
    if (!entry.isDirectory) continue;
    if (shouldSkipDirectory(entry.relPath)) continue;
    if (!hasSkillMd(entry.absPath)) continue;
    dirs.push(entry.absPath);
  }
  dirs.sort();
  return dirs;
}

function shouldDescendInto(entry: WalkedEntry): boolean {
  if (shouldSkipDirectory(entry.relPath)) return false;
  // Refuse to descend into depth-5 dirs so emitted entries are bounded at depth 5 (§9 step 5.4).
  if (depthOf(entry.relPath) >= MAX_RECURSIVE_DEPTH) return false;
  return !hasSkillMd(entry.absPath);
}

function shouldSkipDirectory(relPath: string): boolean {
  const name = basename(relPath);
  if (name.startsWith(".")) return true;
  return SKIPPED_DIRS.has(name);
}

function depthOf(relPath: string): number {
  return relPath.split("/").length;
}
