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
 *
 * The `symbol()` helper deserves its own note: on a real terminal we
 * emit Unicode glyphs (✓ ✗ ⚠ ·) in color; off-terminal we fall back to
 * ASCII tokens (`[ok]`, `[fail]`, `[warn]`, `-`) so piped output and CI
 * logs stay readable on every locale.
 */

/** A styling primitive: every method is either a no-op or an ANSI wrap. */
export interface Styler {
  /** Bold the given text. */
  bold(s: string): string;
  /** Dim (faint) the given text. */
  dim(s: string): string;
  /** Italicize the given text. */
  italic(s: string): string;
  /** Color the given text green (used for success markers). */
  green(s: string): string;
  /** Color the given text red (used for failures). */
  red(s: string): string;
  /** Color the given text yellow (used for warnings). */
  yellow(s: string): string;
  /** Color the given text cyan (used for neutral highlights, e.g. SHAs). */
  cyan(s: string): string;
  /**
   * Render a status symbol in the appropriate color. On a TTY you get
   * `✓ ✗ ⚠ ·` in green / red / yellow / dim-gray. Off-TTY you get
   * `[ok] [fail] [warn] -` with no color.
   */
  symbol(kind: SymbolKind): string;
}

/** The four status kinds `symbol()` knows how to render. */
export type SymbolKind = "ok" | "fail" | "warn" | "muted";

const ANSI = {
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  reset: "\x1b[0m",
} as const;

const GLYPHS: Record<SymbolKind, string> = {
  ok: "✓",
  fail: "✗",
  warn: "⚠",
  muted: "·",
};

const ASCII_TOKENS: Record<SymbolKind, string> = {
  ok: "[ok]",
  fail: "[fail]",
  warn: "[warn]",
  muted: "-",
};

const plainStyler: Styler = {
  bold: (s) => s,
  dim: (s) => s,
  italic: (s) => s,
  green: (s) => s,
  red: (s) => s,
  yellow: (s) => s,
  cyan: (s) => s,
  symbol: (kind) => ASCII_TOKENS[kind],
};

const ansiStyler: Styler = {
  bold: (s) => `${ANSI.bold}${s}${ANSI.reset}`,
  dim: (s) => `${ANSI.dim}${s}${ANSI.reset}`,
  italic: (s) => `${ANSI.italic}${s}${ANSI.reset}`,
  green: (s) => `${ANSI.green}${s}${ANSI.reset}`,
  red: (s) => `${ANSI.red}${s}${ANSI.reset}`,
  yellow: (s) => `${ANSI.yellow}${s}${ANSI.reset}`,
  cyan: (s) => `${ANSI.cyan}${s}${ANSI.reset}`,
  symbol: (kind) => {
    const glyph = GLYPHS[kind];
    if (kind === "ok") return `${ANSI.green}${glyph}${ANSI.reset}`;
    if (kind === "fail") return `${ANSI.red}${glyph}${ANSI.reset}`;
    if (kind === "warn") return `${ANSI.yellow}${glyph}${ANSI.reset}`;
    return `${ANSI.dim}${glyph}${ANSI.reset}`;
  },
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
