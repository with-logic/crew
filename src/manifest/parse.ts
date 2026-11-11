/**
 * Project manifest parser (§9.2).
 *
 * A `.crewrc` is a plain list: one skill reference per line, blank lines
 * and `#` comment lines ignored. Every reference must mean the same thing
 * on every machine, so only git sources and paths inside the project are
 * accepted. Anything else is `manifest_invalid`, naming the line.
 *
 * This file is pure: it parses text it is handed and touches no files.
 */

import { dirname, relative, sep } from "node:path";
import { CrewError } from "../core/errors.ts";
import type { GitSource, PathSource } from "../core/types.ts";
import { parseRef } from "../refs/parse.ts";
import { referenceOn } from "./line.ts";

/** The file name crew looks for at a project root. */
export const MANIFEST_FILENAME = ".crewrc";

/** One reference declared by a manifest. */
export interface ManifestEntry {
  /** 1-based line number in the manifest. */
  readonly line: number;
  /** The reference as written, with surrounding whitespace removed. */
  readonly ref: string;
  /** The parsed reference. Paths are absolute, resolved against the manifest's directory. */
  readonly source: GitSource | PathSource;
}

const TAP_REASON =
  "names a skill through a tap, which depends on each machine's configured taps; " +
  "use a git source such as `@owner/repo//path` or a path inside the project";
const wrapInBackticks = (ref: string): string => `\`${ref}\``;

/** A manifest's contents and where they were read from. */
export interface ManifestInput {
  /** The manifest's full text. */
  readonly text: string;
  /** Absolute path of the manifest; its directory is the project root. */
  readonly file: string;
}

/** Where in a manifest an invalid reference sits; carried as the error's `details` (§9.2). */
export interface ManifestLocation {
  readonly file: string;
  readonly line: number;
  readonly ref: string;
}

/** Build the `manifest_invalid` error for the reference at `at`. */
export function manifestInvalid(at: ManifestLocation, reason: string): CrewError {
  return new CrewError("manifest_invalid", `${at.file} line ${at.line}: ${reason}`, { ...at });
}

/** Parse a manifest's text into its declared references. */
export function parseManifest({ text, file }: ManifestInput): readonly ManifestEntry[] {
  const root = dirname(file);
  const entries: ManifestEntry[] = [];
  const firstLineOf = new Map<string, number>();
  const lines = text.replace(/^﻿/, "").split("\n");
  for (const [index, rawLine] of lines.entries()) {
    const ref = referenceOn(rawLine);
    if (ref === null) continue;
    const line = index + 1;
    const reject = (reason: string): never => {
      throw manifestInvalid({ file, line, ref }, reason);
    };
    const earlier = firstLineOf.get(ref);
    if (earlier !== undefined) reject(`${wrapInBackticks(ref)} repeats line ${earlier}`);
    firstLineOf.set(ref, line);
    entries.push({ line, ref, source: parsePortable(ref, root, reject) });
  }
  return entries;
}

/** Parse one reference, rejecting every form that is not portable across machines. */
function parsePortable(
  ref: string,
  root: string,
  reject: (reason: string) => never,
): GitSource | PathSource {
  let source: ReturnType<typeof parseRef>;
  try {
    source = parseRef(ref, root);
  } catch (err) {
    // parseRef reports a malformed reference as an Error whose message names it.
    return reject((err as Error).message);
  }
  if (source.type === "tap") return reject(`${wrapInBackticks(ref)} ${TAP_REASON}`);
  if (source.type === "git") return source;
  if (!(ref.startsWith("./") || ref.startsWith("../"))) {
    return reject(
      `${wrapInBackticks(ref)} must be a path relative to the project, starting with \`./\``,
    );
  }
  if (isOutside(root, source.path)) {
    return reject(`${wrapInBackticks(ref)} points outside the project`);
  }
  return source;
}

/**
 * True when `path` is neither `root` nor beneath it. The one containment
 * rule for manifest paths: the parser applies it to the path as written,
 * the loader to the path's physical location.
 */
export function isOutside(root: string, path: string): boolean {
  const fromRoot = relative(root, path);
  return fromRoot === ".." || fromRoot.startsWith(`..${sep}`);
}
