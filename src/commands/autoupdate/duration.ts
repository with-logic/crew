/**
 * Interval parsing and formatting for `crew autoupdate` (§10.2).
 *
 * `parseDuration` turns `30s` / `5m` / `2h` / `1d` into seconds and
 * rejects anything else (including a zero quantity) with `usage_error`.
 * `formatInterval` is the inverse for human output: `14400` → "4 hours".
 */

import { CrewError } from "../../core/errors.ts";

/** Parse `30s`, `5m`, `2h`, `1d` into seconds. */
export function parseDuration(raw: string): number {
  const m = raw.match(/^(\d+)([smhd])$/);
  if (!m) {
    throw new CrewError(
      "usage_error",
      `can't parse duration \`${raw}\` — expected a number followed by s/m/h/d, like \`30s\`, \`5m\`, \`2h\`, or \`1d\``,
      { raw },
    );
  }
  const n = Number.parseInt(m[1]!, 10);
  if (n === 0) {
    throw new CrewError("usage_error", "duration must be positive", { raw });
  }
  const unit = m[2] as "s" | "m" | "h" | "d";
  const scale = { s: 1, m: 60, h: 3600, d: 86400 }[unit];
  return n * scale;
}

/** Render a second count as the largest whole unit: "day", "2 hours", "30 minutes". */
export function formatInterval(seconds: number): string {
  if (seconds % 86400 === 0) {
    const d = seconds / 86400;
    return d === 1 ? "day" : `${d} days`;
  }
  if (seconds % 3600 === 0) {
    const h = seconds / 3600;
    return h === 1 ? "hour" : `${h} hours`;
  }
  if (seconds % 60 === 0) {
    const m = seconds / 60;
    return m === 1 ? "minute" : `${m} minutes`;
  }
  return `${seconds} seconds`;
}
