/**
 * Locate and read a project manifest (§9.2).
 *
 * The manifest that governs a directory is the nearest `.crewrc` at or
 * above it. The search stops at a repository root so a stray `.crewrc`
 * higher up — a home directory's, say — never claims an unrelated project.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { MANIFEST_FILENAME, type ManifestEntry, parseManifest } from "./parse.ts";

/** A manifest read from disk. */
export interface Manifest {
  /** Absolute path of the `.crewrc` file. */
  readonly file: string;
  /** The project root: the directory containing the manifest. */
  readonly root: string;
  readonly entries: readonly ManifestEntry[];
}

/** Absolute path of the manifest governing `cwd`, or null when there is none. */
export function findManifest(cwd: string): string | null {
  let dir = resolve(cwd);
  for (;;) {
    const candidate = join(dir, MANIFEST_FILENAME);
    if (statSync(candidate, { throwIfNoEntry: false })?.isFile()) return candidate;
    const parent = dirname(dir);
    if (parent === dir || existsSync(join(dir, ".git"))) return null;
    dir = parent;
  }
}

/** Read and parse the manifest at `file`. Throws `manifest_invalid` per §9.2. */
export function loadManifest(file: string): Manifest {
  return {
    file,
    root: dirname(file),
    entries: parseManifest(readFileSync(file, "utf8"), file),
  };
}
