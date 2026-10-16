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
export function isFsError(err: unknown): boolean {
  return typeof (err as NodeJS.ErrnoException).syscall === "string";
}

/**
 * Nothing usable at the path: it is missing, a folder on the way is a
 * file, or it is a link that dangles or loops (§10.1 counts all as gone).
 */
export function isGoneError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR" || code === "ELOOP";
}

/**
 * The §13 name a failure reports in a result row. A raw filesystem
 * error is a local file crew couldn't use, `source_unreachable`; its
 * errno `.code` is no §13 name. Anything else is `fallback`.
 */
export function crewErrorNameOf(err: unknown, fallback: CrewErrorName): CrewErrorName {
  if (err instanceof CrewError) return err.code;
  return isFsError(err) ? "source_unreachable" : fallback;
}
