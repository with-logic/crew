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
