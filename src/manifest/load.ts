/**
 * Locate and read a project manifest (§9.2).
 *
 * The manifest that governs a directory is the nearest regular file named
 * `.crewrc` at or above it. The search stops at a repository root so a stray `.crewrc`
 * higher up — a home directory's, say — never claims an unrelated project.
 */

import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { CrewError } from "../core/errors.ts";
import {
  isOutside,
  MANIFEST_FILENAME,
  type ManifestEntry,
  manifestInvalid,
  parseManifest,
} from "./parse.ts";

/** A manifest read from disk. */
export interface Manifest {
  /** Absolute path of the `.crewrc` file. */
  readonly file: string;
  /** The directory containing the manifest; skills install under it at project scope. */
  readonly projectRoot: string;
  readonly entries: readonly ManifestEntry[];
}

/** The manifest governing `cwd`, read and parsed, or null when there is none. */
export function loadManifestFor(cwd: string): Manifest | null {
  let dir = resolve(cwd);
  for (;;) {
    const file = join(dir, MANIFEST_FILENAME);
    const text = readRegularFile(file);
    if (text !== null) return buildManifest(file, text);
    const parent = dirname(dir);
    if (parent === dir || existsSync(join(dir, ".git"))) return null;
    dir = parent;
  }
}

/** What is at a path crew expects to hold one of its own text files. */
export type FileAtPath =
  | { readonly kind: "absent" }
  | { readonly kind: "file"; readonly text: string }
  /** Something is there that is not a regular file: a link, a directory, a device. */
  | { readonly kind: "other" };

/**
 * Open `file` once, without following a symbolic link, and report what is
 * there: nothing, a regular file (with its text), or something else. The
 * type is decided on the same open handle the bytes come from, so the file
 * cannot be swapped for a link between a check and a read.
 */
export function readFileAt(file: string): FileAtPath {
  let fd: number;
  try {
    // O_NONBLOCK: opening a FIFO must not hang waiting for a writer.
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { kind: "absent" };
    if (code === "ELOOP") return { kind: "other" }; // A symbolic link.
    // Anything else means the file is there and cannot be read. Treating a
    // manifest that way as absent would let one further up govern the project.
    throw new CrewError(
      "source_unreachable",
      `couldn't read \`${file}\` (${code})`,
      { file },
      `Check that \`${basename(file)}\` is readable and that the directories above it can be entered.`,
    );
  }
  try {
    return fstatSync(fd).isFile()
      ? { kind: "file", text: readFileSync(fd, "utf8") }
      : { kind: "other" };
  } finally {
    closeSync(fd);
  }
}

/**
 * The text of `file` if it is a regular file, else null. A symlinked
 * `.crewrc` is not a manifest: following one would read whatever file a
 * checkout chose to point it at.
 */
function readRegularFile(file: string): string | null {
  const found = readFileAt(file);
  return found.kind === "file" ? found.text : null;
}

/** Parse `text` read from `file`. Throws `manifest_invalid` per §9.2. */
function buildManifest(file: string, text: string): Manifest {
  const projectRoot = dirname(file);
  const entries = parseManifest({ text, file });
  const physicalRoot = realpathSync(projectRoot);
  for (const entry of entries) {
    if (entry.source.type === "path" && escapesThroughSymlink(entry.source.path, physicalRoot)) {
      throw manifestInvalid(
        { file, line: entry.line, ref: entry.ref },
        `\`${entry.ref}\` reaches outside the project through a symbolic link`,
      );
    }
  }
  return { file, projectRoot, entries };
}

/**
 * The parser's containment check is lexical; this one is physical. A path
 * that stays inside the project by name can still leave it through a
 * symlinked directory. A path that does not exist yet cannot escape, and
 * the install flow reports it as missing.
 */
function escapesThroughSymlink(path: string, physicalRoot: string): boolean {
  if (!existsSync(path)) return false;
  return isOutside(physicalRoot, realpathSync(path));
}
