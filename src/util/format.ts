/**
 * Cross-cutting formatting helpers for human-friendly command output.
 *
 * Commands should lean on these instead of re-inventing the same
 * plural / column / time-ago logic in four places. Everything here is
 * pure; style is up to the caller (no ANSI codes emitted).
 */

import { homedir } from "node:os";

/**
 * Pluralize a word by count. `plural(1, "skill") → "1 skill"`,
 * `plural(2, "skill") → "2 skills"`. Pass an explicit plural for
 * irregular words: `plural(3, "entry", "entries")`.
 */
export function plural(count: number, singular: string, pluralForm?: string): string {
  if (count === 1) return `1 ${singular}`;
  return `${count} ${pluralForm ?? `${singular}s`}`;
}

/**
 * Return a short human phrase for how long ago an ISO timestamp was.
 * Under a minute → "just now"; under an hour → "5m ago"; under a day
 * → "3h ago"; under a week → "2d ago"; longer → the YYYY-MM-DD date.
 * `now` is injectable so tests don't flake on wall-clock drift.
 */
export function timeAgo(isoTimestamp: string, now: Date = new Date()): string {
  const then = new Date(isoTimestamp).getTime();
  if (Number.isNaN(then)) return isoTimestamp;
  const deltaMs = now.getTime() - then;
  const seconds = Math.max(0, Math.floor(deltaMs / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return isoTimestamp.slice(0, 10);
}

/**
 * Shorten `$HOME/<rest>` to `~/<rest>` in a path. Leaves anything
 * outside home alone. Safe on any platform — uses `os.homedir()`.
 */
export function shortenHome(path: string, home: string = homedir()): string {
  if (path === home) return "~";
  if (path.startsWith(`${home}/`)) return `~/${path.slice(home.length + 1)}`;
  return path;
}

/**
 * Render an aligned two-column table of rows. Each row is a tuple of
 * strings; the first column is padded to the longest first-cell width
 * plus `gap` spaces. The second column is printed as-is (no wrapping
 * here — the caller handles overflow).
 *
 * Returns the rendered lines. Empty input → empty output.
 */
export function twoColumnTable(
  rows: readonly (readonly [string, string])[],
  gap: number = 2,
): string[] {
  if (rows.length === 0) return [];
  let leftWidth = 0;
  for (const [left] of rows) leftWidth = Math.max(leftWidth, visualWidth(left));
  const padding = " ".repeat(gap);
  return rows.map(
    ([left, right]) => `${left}${" ".repeat(leftWidth - visualWidth(left))}${padding}${right}`,
  );
}

/**
 * Render an aligned N-column table. Each row is a tuple of strings
 * matching the column count. Columns are padded to their widest natural
 * width with `gap` spaces between them. Trailing whitespace on the last
 * column is stripped.
 */
export function columns(rows: readonly (readonly string[])[], gap: number = 2): string[] {
  if (rows.length === 0) return [];
  const colCount = Math.max(...rows.map((r) => r.length));
  const widths = new Array<number>(colCount).fill(0);
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      widths[i] = Math.max(widths[i]!, visualWidth(row[i]!));
    }
  }
  const padding = " ".repeat(gap);
  return rows.map((row) => {
    const parts: string[] = [];
    for (let i = 0; i < row.length; i++) {
      const cell = row[i] ?? "";
      if (i === row.length - 1) parts.push(cell);
      else parts.push(`${cell}${" ".repeat(widths[i]! - visualWidth(cell))}`);
    }
    return parts.join(padding).trimEnd();
  });
}

// ANSI escape matcher, built from a char-code literal because Biome
// disallows control-char literals inside regex source text.
const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

/**
 * Compute the visible width of a string, ignoring ANSI escape sequences
 * (`ESC [Nm`). Needed so a styled cell lines up with an unstyled one.
 * Unicode width is approximated as character count — adequate for the
 * ASCII-plus-occasional-glyph content crew emits.
 */
export function visualWidth(s: string): number {
  return s.replace(ANSI_PATTERN, "").length;
}

/**
 * Truncate a string to `width` visual columns, appending `…` if a cut
 * happened. ANSI escapes in the input are preserved but not counted
 * against width. Suitable for one-line descriptions in tables.
 */
export function truncate(s: string, width: number): string {
  if (width <= 0) return "";
  if (visualWidth(s) <= width) return s;
  // Strip ANSI to get a predictable slice, then re-apply nothing — the
  // caller is responsible for re-styling a truncated summary line.
  const plain = s.replace(ANSI_PATTERN, "");
  if (width <= 1) return "…";
  return `${plain.slice(0, width - 1)}…`;
}

/**
 * Wrap `text` to `width` columns, never breaking mid-word. Returns one
 * line per wrapped segment. An empty string yields a single empty line.
 */
export function wrap(text: string, width: number): string[] {
  if (text.length === 0) return [""];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

/**
 * Take the first sentence-or-two of a longer description, capped at a
 * character budget. Prefer breaking on a sentence boundary (`. `, `! `,
 * `? `); fall back to truncating with `…` if there's no break in budget.
 */
export function firstSentences(description: string, maxChars: number = 240): string {
  const trimmed = description.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const boundary = findSentenceBreak(trimmed, maxChars);
  if (boundary > 0) return trimmed.slice(0, boundary + 1).trim();
  return `${trimmed.slice(0, maxChars - 1).trim()}…`;
}

function findSentenceBreak(text: string, maxChars: number): number {
  const candidates = [".", "!", "?"];
  let best = -1;
  for (const punct of candidates) {
    // Find the last occurrence of `<punct> ` within the budget.
    let idx = 0;
    while (idx < maxChars) {
      const next = text.indexOf(`${punct} `, idx);
      if (next < 0 || next >= maxChars) break;
      best = Math.max(best, next);
      idx = next + 1;
    }
  }
  return best;
}
