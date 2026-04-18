/**
 * Filesystem helpers crew uses across modules.
 *
 * These are thin wrappers around `node:fs` that add (a) ergonomic defaults
 * for directory walking and (b) safe rename-based replacement. Everything
 * here is synchronous — crew is a short-lived CLI and synchronous code is
 * easier to reason about for correctness.
 */

import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";

/** Ensure a directory exists (like `mkdir -p`). */
export function ensureDir(path: string, mode: number = 0o755): void {
  mkdirSync(path, { recursive: true, mode });
}

/** Read a file, returning its raw bytes. */
export function readBytes(path: string): Buffer {
  return readFileSync(path);
}

/** Read a file as UTF-8 text. */
export function readText(path: string): string {
  return readFileSync(path, "utf8");
}

/** Write a file as UTF-8, creating parents as needed. */
export function writeText(path: string, contents: string): void {
  ensureDir(dirname(path));
  writeFileSync(path, contents, { encoding: "utf8" });
}

/** Recursively remove a path if it exists. No-op if missing. */
export function rmrf(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

/** Does a path exist? */
export function exists(path: string): boolean {
  return existsSync(path);
}

/** Is a path a directory? (false if missing or any error.) */
export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** List immediate children of a directory, or `[]` if the directory is absent. */
export function listDir(path: string): string[] {
  if (!isDirectory(path)) return [];
  return readdirSync(path);
}

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
    const names = readdirSync(current);
    for (const name of names) {
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
      if (!options.shouldEmit || options.shouldEmit(entry)) {
        results.push(entry);
      }
      if (entry.isDirectory && (!options.shouldDescend || options.shouldDescend(entry))) {
        stack.push(abs);
      }
    }
  }
  return results;
}

/** Read a symlink's target as raw bytes (utf-8). */
export function readSymlinkTarget(path: string): string {
  return readlinkSync(path);
}

/** Replace `dest` atomically with `src` (rename, removing any existing dest first). */
export function atomicReplace(src: string, dest: string): void {
  ensureDir(dirname(dest));
  if (existsSync(dest)) rmrf(dest);
  renameSync(src, dest);
}

/** Convert any relative path to POSIX (/) form. */
export function toPosix(p: string): string {
  return p.split(/[\\/]+/).join("/");
}

/** `touch` — creates an empty file if missing. */
export function touch(path: string): void {
  ensureDir(dirname(path));
  const fd = openSync(path, "a");
  closeSync(fd);
}
