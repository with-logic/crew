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
import { redactText } from "../util/redact.ts";

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
const CREDENTIAL_REASON =
  "a line carries a credential in its URL, and this file is meant to be checked in; " +
  "remove it and let git supply the credential (a credential helper, or an SSH URL)";
/** The query parameters §5.2 treats as secrets. */
const SENSITIVE_QUERY_PARAMS: ReadonlySet<string> = new Set([
  "token",
  "access_token",
  "private_token",
  "api_key",
  "apikey",
  "password",
]);
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
    const ref = rawLine.trim();
    if (ref === "" || ref.startsWith("#")) continue;
    const line = index + 1;
    const reject = (reason: string): never => {
      throw manifestInvalid({ file, line, ref: redactText(ref) }, reason);
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
  if (source.type === "git") {
    // A manifest is meant to be checked in, so no line of it may hold a secret.
    if (carriesCredential(ref, source)) return reject(CREDENTIAL_REASON);
    return source;
  }
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

/**
 * True when a git line holds a credential (§9.2): a password or an
 * `http(s)` userinfo token in its clone URL, or one of the sensitive query
 * parameters of §5.2 anywhere in the line.
 *
 * This is deliberately not the display redactor. That masks every query
 * value it does not recognize, which is the right way to print a URL and
 * the wrong way to decide a line is invalid: a pasted browser URL ending
 * in `?tab=readme` holds no secret.
 */
function carriesCredential(ref: string, source: GitSource): boolean {
  // Keys are compared after decoding, so `%74oken` is `token`.
  // The query is what lies between the first `?` and any fragment; a `?`
  // after a `#` is fragment text, which §8.2 discards.
  const beforeFragment = ref.split("#", 1)[0] as string;
  const query = beforeFragment.includes("?")
    ? beforeFragment.slice(beforeFragment.indexOf("?") + 1)
    : "";
  for (const key of new URLSearchParams(query).keys()) {
    if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) return true;
  }
  // Only a URL with a scheme has userinfo that can be a secret. An
  // scp-style remote (`git@host:owner/repo`) has a username.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(source.url)) return false;
  const url = new URL(source.url);
  const isHttp = url.protocol === "http:" || url.protocol === "https:";
  return url.password !== "" || (isHttp && url.username !== "");
}
