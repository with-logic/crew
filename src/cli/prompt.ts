/**
 * Synchronous interactive prompt (§16.4).
 *
 * Prints a message to stderr and reads a single line from stdin. Used
 * by the tap-vs-skill collision prompt on `crew install`. Deliberately
 * synchronous to match the rest of the CLI flow.
 *
 * Three outcomes:
 *   - `"yes"`   — user pressed enter or typed y/yes (case-insensitive).
 *   - `"no"`    — user typed n/no.
 *   - `"abort"` — stdin is not a TTY (scripts/CI), or EOF with no input.
 *
 * The "abort" case is important: we never want to silently install a
 * whole tap in a non-interactive context. The install command maps
 * `"abort"` to a `usage_error` directing the user to `--yes` or to
 * the qualified `<other-tap>/<name>` form.
 */

import { readSync } from "node:fs";

/** Outcome of a confirmation prompt. */
export type ConfirmOutcome = "yes" | "no" | "abort";

/** The shape commands use to prompt. Tests inject a stub. */
export type PromptFn = (message: string) => ConfirmOutcome;

/** Injection seam — tests reassign these to stub stdin/stderr. */
export interface PromptIO {
  isTTY(): boolean;
  writeStderr(s: string): void;
  /**
   * Read a single byte from the given fd; return number of bytes read
   * (0 on EOF) or throws on error. Defaults to fd 0 (stdin) in
   * production. Tests pass a different fd (e.g. an empty file) to
   * exercise the wiring without blocking on a real terminal.
   */
  readByte(buf: Buffer, fd?: number): number;
}

/**
 * Production IO. Exported so tests can exercise each method
 * without invoking the full prompt (which would block on a real TTY).
 */
export const realIO: PromptIO = {
  isTTY: () => Boolean(process.stdin.isTTY),
  writeStderr: (s) => {
    process.stderr.write(s);
  },
  readByte: (buf, fd = 0) => readSync(fd, buf, 0, 1, null),
};

/**
 * Default prompt implementation: write to stderr, read a line from fd 0.
 * Returns `"abort"` in non-TTY contexts without reading. Accepts an
 * IO-seam override for tests.
 */
export function defaultPrompt(message: string, io: PromptIO = realIO): ConfirmOutcome {
  if (!io.isTTY()) return "abort";
  io.writeStderr(message);
  const line = readLineSync(io);
  if (line === null) return "abort";
  const trimmed = line.trim().toLowerCase();
  if (trimmed === "" || trimmed === "y" || trimmed === "yes") return "yes";
  if (trimmed === "n" || trimmed === "no") return "no";
  // Any other input is treated as "no" — the user deliberately typed
  // something, we don't want to guess at what they meant.
  return "no";
}

/**
 * Read a single line from fd 0, up to a newline or EOF. Returns `null`
 * on EOF with no bytes read. Byte-at-a-time to avoid swallowing input
 * a caller might want later.
 */
function readLineSync(io: PromptIO): string | null {
  const buf = Buffer.alloc(1);
  const chars: string[] = [];
  for (;;) {
    let n: number;
    try {
      n = io.readByte(buf);
    } catch {
      break;
    }
    if (n === 0) break;
    const ch = buf.toString("utf8", 0, 1);
    if (ch === "\n") return chars.join("");
    chars.push(ch);
  }
  return chars.length === 0 ? null : chars.join("");
}
