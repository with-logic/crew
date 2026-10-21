/** Source filesystem reads preserve operational failures before validation or staging (§9, §13). */

import { accessSync, constants, copyFileSync, lstatSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { CrewError } from "../core/errors.ts";
import { hashDirectory } from "../hash/content.ts";
import { copyTree } from "../util/copy.ts";
import { isInside, readBytes, type WalkedEntry, type WalkOptions, walk } from "../util/fs.ts";
import { readSourceFile, sourceReadFailure } from "../util/source-read.ts";

/** Missing paths are absent; inaccessible source directories are operational failures. */
export function isSourceDirectory(path: string, followSymlinks = true): boolean {
  try {
    if (!(followSymlinks ? statSync(path) : lstatSync(path)).isDirectory()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch (err) {
    const { code } = err as NodeJS.ErrnoException;
    if (code === "ENOENT" || code === "ENOTDIR" || code === "ELOOP") return false;
    throw sourceDirectoryFailure(path, err);
  }
}

/** List an acquired source, retaining native permission diagnostics. */
export function listSourceDirectory(path: string): string[] {
  if (!isSourceDirectory(path)) return [];
  try {
    return readdirSync(path);
  } catch (err) {
    throw sourceDirectoryFailure(path, err);
  }
}

/** Normalize source traversal only; target/store hashing and copying keep their boundaries. */
export function walkSourceDirectory(path: string, options: WalkOptions): WalkedEntry[] {
  if (!isSourceDirectory(path)) return [];
  try {
    return walk(path, options);
  } catch (err) {
    if (err instanceof CrewError) throw err;
    // Native walker errors identify the directory/entry whose filesystem operation failed.
    throw sourceDirectoryFailure((err as NodeJS.ErrnoException).path!, err);
  }
}

function sourceDirectoryFailure(path: string, err: unknown): CrewError {
  return new CrewError(
    "source_unreachable",
    `cannot inspect source \`${path}\`: ${(err as Error).message}`,
    { path },
    "Check that the source directory can be listed and searched, and that you can access its parent directories.",
  );
}

/** Hash an acquired source; target and store hashing retain their existing error behavior. */
export function hashSourceDirectory(path: string): string {
  try {
    return hashDirectory(path, (file) => readSourceFile(file, readBytes));
  } catch (err) {
    if (err instanceof CrewError) throw err;
    throw sourceDirectoryFailure((err as NodeJS.ErrnoException).path!, err);
  }
}

/** Copy an acquired source, distinguishing source permissions from destination failures. */
export function copySourceTree(source: string, destination: string): void {
  try {
    copyTree(source, destination, { stripRootMarker: true });
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    const path = error.path!;
    // A destination may sit inside the source; its root and descendants remain write failures.
    const sourceInspectionFailed =
      error.syscall === "lstat" &&
      isInside(source, path) &&
      resolve(path) !== resolve(destination) &&
      !isInside(destination, path);
    // `copyTree` lists only source directories; destination operations never use scandir.
    if (error.syscall === "scandir" || sourceInspectionFailed)
      throw sourceDirectoryFailure(path, err);
    throwCopyFailure(err);
  }
}

/** Copy raw source bytes without buffering, keeping destination errors native (§9 step 8). */
export function copySourceFile(source: string, destination: string): void {
  try {
    copyFileSync(source, destination);
  } catch (err) {
    throwCopyFailure(err);
  }
}

function throwCopyFailure(err: unknown): never {
  const error = err as NodeJS.ErrnoException;
  if (error.syscall !== "copyfile") throw err;
  // copyfile reports the source in `path` even when the destination write failed.
  try {
    accessSync(error.path!, constants.R_OK);
  } catch (readError) {
    throw sourceReadFailure(error.path!, readError);
  }
  throw err;
}
