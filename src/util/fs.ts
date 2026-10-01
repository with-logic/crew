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
  readdirSync,
  readFileSync,
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

/**
 * Mode for a crew-written file that did not exist before: owner-only.
 *
 * `config.yaml` can hold clone URLs carrying credentials, and `state.json`
 * records every install location, so neither belongs in a world-readable
 * file by default. The umask would otherwise decide, which on a typical
 * host means `0644`.
 */
const NEW_FILE_MODE = 0o600;

/**
 * Write a file as UTF-8, creating parents as needed.
 *
 * Published atomically: the bytes land in a sibling temp file which is
 * then renamed over `path`. Readers take no lock (§14 — read-only
 * commands never lock), so a plain in-place write would let a concurrent
 * `crew list` observe a truncated `config.yaml` and fail `config_invalid`.
 * `renameSync` within one directory is atomic on POSIX and Windows, so a
 * reader sees either the old file or the new one, never a partial one.
 *
 * Rename replaces the inode, so the temp file's permissions become the
 * published file's. An existing target's mode is therefore carried over
 * explicitly — without that, a `0600` config silently widens to whatever
 * the umask allows on its next write. A file crew is creating for the
 * first time gets `NEW_FILE_MODE`.
 */
export function writeText(path: string, contents: string): void {
  ensureDir(dirname(path));
  // The suffix keeps the temp name out of any directory listing crew
  // treats as meaningful (a skill dir, a tap root) if we crash mid-write.
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(tmp, contents, { encoding: "utf8", mode: modeFor(path) });
    renameSync(tmp, path);
  } catch (err) {
    // The temp file can hold whatever the caller was writing — config.yaml
    // carries credential-bearing clone URLs — so a failed write or rename
    // must not leave it behind. Cleanup failure is swallowed deliberately:
    // the original error is what the user needs, and masking it with an
    // unlink error would hide the real cause.
    try {
      rmSync(tmp, { force: true });
    } catch {
      // Nothing useful to do; rethrowing the original below.
    }
    throw err;
  }
}

/** The existing file's permission bits, or `NEW_FILE_MODE` if it is new. */
function modeFor(path: string): number {
  try {
    return statSync(path).mode & 0o777;
  } catch {
    return NEW_FILE_MODE;
  }
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
      if (!options.shouldEmit || options.shouldEmit(entry)) results.push(entry);
      if (entry.isDirectory && (!options.shouldDescend || options.shouldDescend(entry)))
        stack.push(abs);
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
