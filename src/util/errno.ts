/**
 * Short reasons for filesystem errors in user-facing messages (§13).
 */

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
