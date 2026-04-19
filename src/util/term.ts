/**
 * Terminal-awareness helpers: color toggling, style wrapping, width
 * detection.
 *
 * The rules for "should we emit ANSI escape codes":
 *   - `NO_COLOR` env var set (any value) → no color (https://no-color.org).
 *   - `process.stdout.isTTY` falsy → no color (piped, redirected, logged).
 *   - otherwise → yes.
 *
 * Commands don't call `process.stdout` directly, so a command that
 * wants to emit styled text asks the CLI entry point for a `Styler`
 * (via `CommandContext`), then wraps segments with `style.bold(...)` /
 * `style.dim(...)`. When color is disabled, the styler returns the raw
 * text — no escape codes, no width accounting to do.
 */

/** A styling primitive: every method is either a no-op or an ANSI wrap. */
export interface Styler {
  bold(s: string): string;
  dim(s: string): string;
}

const ANSI = {
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  reset: "\x1b[0m",
} as const;

const plainStyler: Styler = {
  bold: (s) => s,
  dim: (s) => s,
};

const ansiStyler: Styler = {
  bold: (s) => `${ANSI.bold}${s}${ANSI.reset}`,
  dim: (s) => `${ANSI.dim}${s}${ANSI.reset}`,
};

/** Pick a styler based on whether color is currently enabled. */
export function makeStyler(colorOn: boolean): Styler {
  return colorOn ? ansiStyler : plainStyler;
}

/** Decide whether to emit color right now. Pure wrt. process.env + process.stdout. */
export function colorEnabled(): boolean {
  if (process.env["NO_COLOR"] !== undefined) return false;
  return Boolean(process.stdout.isTTY);
}

/** Current terminal width, or 80 if unknown. */
export function terminalWidth(): number {
  return process.stdout.columns ?? 80;
}
