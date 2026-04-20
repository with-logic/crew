/**
 * Synchronous interactive prompts (§16.4).
 *
 * Two shapes:
 *   - `confirm(msg)` — binary Y/n prompt. Returns "yes" | "no" | "abort".
 *     Used by the tap-vs-skill collision prompt when exactly one other
 *     tap hosts a same-named skill.
 *   - `choice(msg, n)` — numbered-menu prompt accepting `1..n`. Returns
 *     the chosen index (0-based) or "abort". Used when two or more
 *     other taps host the same-named skill; a binary Y/n can't name
 *     them all.
 *
 * In both shapes, `"abort"` is returned when stdin is not a TTY
 * (scripts/CI) or when the user's input is unparseable. The install
 * command maps `"abort"` to a `usage_error` directing the user to
 * `--yes` or to a qualified `<tap>/<skill>` form.
 */

import { readSync } from "node:fs";

/** Outcome of a binary confirmation prompt. */
export type ConfirmOutcome = "yes" | "no" | "abort";

/** Outcome of a numbered-menu prompt. */
export type ChoiceOutcome = { kind: "choice"; index: number } | "abort";

/** Binary confirm: tests inject a stub that returns a fixed answer. */
export type PromptFn = (message: string) => ConfirmOutcome;

/** Numbered menu: tests inject a stub that returns a fixed choice. */
export type ChoicePromptFn = (message: string, choiceCount: number) => ChoiceOutcome;

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
 * Numbered-menu prompt: accepts `1..choiceCount`. Empty input returns
 * choice 0 (the conventional default). Any other input returns
 * `"abort"` — the command maps that to a `usage_error` with a hint at
 * how to pick unambiguously (--yes or a qualified ref).
 */
export function defaultChoicePrompt(
  message: string,
  choiceCount: number,
  io: PromptIO = realIO,
): ChoiceOutcome {
  if (!io.isTTY()) return "abort";
  io.writeStderr(message);
  const line = readLineSync(io);
  if (line === null) return "abort";
  const trimmed = line.trim();
  if (trimmed === "") return { kind: "choice", index: 0 };
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(n) || n < 1 || n > choiceCount) return "abort";
  return { kind: "choice", index: n - 1 };
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
