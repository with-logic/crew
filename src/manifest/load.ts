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
import { dirname, join, resolve } from "node:path";
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

/**
 * Read `file` only if it is a regular file, deciding that on the same open
 * handle the bytes come from. A symlinked `.crewrc` is not a manifest:
 * following one would read whatever file a checkout chose to point it at.
 * Checking the path first and reading it second would leave a window in
 * which the file could be swapped for a link, so the open itself refuses
 * links (`O_NOFOLLOW`) and the type is confirmed on the descriptor.
 */
function readRegularFile(file: string): string | null {
  let fd: number;
  try {
    // O_NONBLOCK: opening a FIFO named `.crewrc` must not hang waiting for a writer.
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (err) {
    // Absent (ENOENT), or a symbolic link (ELOOP): not a manifest, keep looking.
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ELOOP") return null;
    // Anything else means a manifest is there and cannot be read. Skipping
    // it would let a manifest further up govern this project instead.
    throw new CrewError(
      "source_unreachable",
      `couldn't read \`${file}\` (${code})`,
      { file },
      `Check that \`${MANIFEST_FILENAME}\` is readable and that the directories above it can be entered.`,
    );
  }
  try {
    return fstatSync(fd).isFile() ? readFileSync(fd, "utf8") : null;
  } finally {
    closeSync(fd);
  }
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
