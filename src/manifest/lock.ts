/**
 * Project lockfile format (§9.3).
 *
 * `.crewrc.lock` sits beside `.crewrc` and records the commit each git line
 * resolved to, so every checkout of a project installs the same bytes even
 * for lines that name a branch, a tag, or nothing at all. crew writes it;
 * people commit it and do not edit it.
 *
 * The file is line-based, one `<commit> <reference>` pair per line, sorted
 * by reference, so two branches that each add a line merge cleanly. This
 * module is pure: it parses and produces text and touches no files.
 */

import { CrewError } from "../core/errors.ts";
import type { ManifestEntry } from "./parse.ts";

/** The lockfile's name; it lives in the manifest's directory. */
export const LOCK_FILENAME = ".crewrc.lock";

/** First line of every lockfile crew writes: the format, and its version. */
export const LOCK_HEADER = "# crew lockfile v1 — written by `crew install`; do not edit by hand.";

const FULL_SHA = /^[0-9a-f]{40}$/;
const LOCK_LINE = /^([0-9a-f]{40}) (\S.*)$/;

/** Commits by manifest reference, exactly as the reference is written in `.crewrc`. */
export type Lock = ReadonlyMap<string, string>;

/** A lockfile's contents and where they were read from. */
export interface LockInput {
  readonly text: string;
  /** Absolute path of the lockfile, for error messages. */
  readonly file: string;
}

/** Parse a lockfile. Throws `manifest_invalid` naming the file and line. */
export function parseLock({ text, file }: LockInput): Lock {
  const lines = text.split("\n");
  const reject = (line: number, reason: string): never => {
    throw new CrewError("manifest_invalid", `${file} line ${line}: ${reason}`, { file, line });
  };
  if (lines[0] !== LOCK_HEADER) {
    reject(
      1,
      "is not a lockfile this version of crew understands; delete it and run `crew install`",
    );
  }
  const lock = new Map<string, string>();
  for (const [index, raw] of lines.entries()) {
    if (raw === "" || raw.startsWith("#")) continue;
    const match = LOCK_LINE.exec(raw);
    if (!match) reject(index + 1, "is not `<40-character commit> <reference>`");
    const [, sha, ref] = match as unknown as [string, string, string];
    if (lock.has(ref)) reject(index + 1, `locks \`${ref}\` a second time`);
    lock.set(ref, sha);
  }
  return lock;
}

/** The text of a lockfile holding `lock`, entries sorted by reference. */
export function serializeLock(lock: Lock): string {
  const lines = [...lock.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([ref, sha]) => `${sha} ${ref}`);
  return `${[LOCK_HEADER, ...lines].join("\n")}\n`;
}

/**
 * True when a manifest line gets a lock entry: a git line that does not
 * already name a full commit. A path line has no commit, and a line pinned
 * to a full commit is its own lock.
 */
export function isLockable(entry: ManifestEntry): boolean {
  const { source } = entry;
  return source.type === "git" && !(source.ref !== null && FULL_SHA.test(source.ref));
}

/**
 * The reference that installs `entry` at exactly `sha`: the same repository
 * and subpath, with the commit in place of whatever ref the line named.
 */
export function pinnedRef(entry: ManifestEntry, sha: string): string {
  const { source } = entry;
  if (source.type !== "git") return entry.ref;
  const subpath = source.subpath === "" ? "" : `//${source.subpath}`;
  return `${source.url}@${sha}${subpath}`;
}
