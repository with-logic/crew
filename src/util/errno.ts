/**
 * Filesystem errors: short reasons for user-facing messages, and how
 * crew classifies them (§13).
 */

import { CrewError, type CrewErrorName } from "../core/errors.ts";

/**
 * `EACCES: permission denied` from Node's `EACCES: permission denied,
 * open '/path'` — the path is dropped because the caller's own message
 * already names it, and repeating a long path twice buries the reason.
 */
export function errnoReason(err: unknown): string {
  return (err as Error).message.split(",")[0]!;
}

/**
 * True for an OS-level error from `node:fs` and the like: only those
 * carry `syscall`, while a library's error may carry a `code` too.
 */
function isFsError(err: unknown): boolean {
  return typeof (err as NodeJS.ErrnoException).syscall === "string";
}

/**
 * The next step when crew can't read or look at a local path: a skill's
 * `SKILL.md` or another of its files, a path tap, or a skill's recorded
 * location on update.
 */
const UNREADABLE_REMEDY = "Check that it is readable by you (its permissions, and its folder's).";

/** The next step when a path, or a name on the way to it, is too long to look up. */
const TOO_LONG_REMEDY =
  "Shorten the path: a name on the way — a link's text included — or the whole path is too long for the system to look up.";

/** `source_unreachable` for a local path crew couldn't look at, or read (§13). */
export function unreadablePathError(
  path: string,
  err: unknown,
  verb: "look at" | "read" = "look at",
): CrewError {
  const tooLong = (err as NodeJS.ErrnoException).code === "ENAMETOOLONG";
  return new CrewError(
    "source_unreachable",
    `couldn't ${verb} \`${path}\` — ${errnoReason(err)}`,
    { path },
    tooLong ? TOO_LONG_REMEDY : UNREADABLE_REMEDY,
  );
}

/**
 * Nothing usable at the path: it is missing, a folder on the way is a
 * file, or it is a link that dangles or loops (§10.1 counts all as gone).
 */
export function isGoneError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR" || code === "ELOOP";
}

/** A §13 name, or a filesystem errno code (`EACCES`) for which §13 has none. */
export type FailureCode = CrewErrorName | `E${Uppercase<string>}`;

/**
 * The code a failure reports where a raw filesystem error is about an
 * agent's folder, not the source — installing into or removing from one
 * agent, or a re-expansion child crew couldn't write: a §13 name for a
 * `CrewError` (a safety check, §7.3, or a staging failure), or the errno
 * code itself. Compare `crewErrorNameOf`, for a failure about the source.
 */
export function failureCodeOf(err: unknown): FailureCode {
  if (err instanceof CrewError) return err.code;
  return isFsError(err) ? ((err as NodeJS.ErrnoException).code as FailureCode) : "usage_error";
}

/**
 * The §13 name a failure about the source reports — an entry's update, or
 * a tap's re-expansion: a raw filesystem error is a local file crew
 * couldn't use, `source_unreachable`, since its errno `.code` is no §13
 * name. Anything else is `fallback`. Compare `failureCodeOf`.
 */
export function crewErrorNameOf(err: unknown, fallback: CrewErrorName): CrewErrorName {
  if (err instanceof CrewError) return err.code;
  return isFsError(err) ? "source_unreachable" : fallback;
}
