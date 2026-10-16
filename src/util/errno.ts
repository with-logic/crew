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
export const UNREADABLE_REMEDY =
  "Check that it is readable by you (its permissions, and its folder's).";

/** `source_unreachable` for a local path crew couldn't look at, or read (§13). */
export function unreadablePathError(path: string, err: unknown, verb = "look at"): CrewError {
  return new CrewError(
    "source_unreachable",
    `couldn't ${verb} \`${path}\` — ${errnoReason(err)}`,
    { path },
    UNREADABLE_REMEDY,
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

/**
 * The code a failure installing into, or removing from, one agent
 * reports: a §13 name for a `CrewError` (a safety check, §7.3), or the
 * errno code of a filesystem error on the agent's folder (`EACCES`) —
 * which has no §13 name, and isn't the source's fault.
 */
export function agentFailureCode(err: unknown): string {
  return (err as { code?: string }).code ?? "usage_error";
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
