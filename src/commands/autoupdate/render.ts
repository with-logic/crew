/**
 * Human output for `crew autoupdate status` (§10.2).
 *
 * A single bold headline ("Autoupdate is on" / "Autoupdate is off"),
 * then a small metadata block — how often crew checks, when it last
 * ran — and a pointer to the log file when relevant.
 */

import { timeAgo, twoColumnTable } from "../../util/format.ts";
import type { Styler } from "../../util/term.ts";
import { formatInterval } from "./duration.ts";

export function renderStatus(
  enabled: boolean,
  intervalSeconds: number,
  loaded: boolean,
  lastRun: string | null,
  lastExitStatus: number | null,
  style: Styler,
): string[] {
  const lines: string[] = [];
  if (!enabled) {
    lines.push(`${style.symbol("muted")} ${style.bold("Autoupdate is off")}`);
    lines.push("");
    lines.push(style.dim("Turn it on with `crew autoupdate enable`."));
    return lines;
  }
  const headline = loaded
    ? `${style.symbol("ok")} ${style.bold("Autoupdate is on")}`
    : `${style.symbol("warn")} ${style.bold("Autoupdate is on, but the background updater isn't loaded")}`;
  lines.push(headline);
  lines.push("");
  const rows: [string, string][] = [];
  rows.push([style.dim("frequency"), `every ${formatInterval(intervalSeconds)}`]);
  rows.push([
    style.dim("last ran"),
    lastRun
      ? `${timeAgo(lastRun)} ${style.dim(`(${lastRun.slice(0, 10)})`)}`
      : style.dim("not yet"),
  ]);
  if (lastExitStatus !== null) rows.push([style.dim("last exit"), String(lastExitStatus)]);
  for (const line of twoColumnTable(rows, 2)) lines.push(`  ${line}`);
  lines.push("");
  if (loaded) {
    lines.push(style.dim("Logs: `~/.crew/logs/autoupdate.log`."));
  } else {
    // `doctor --repair` is deliberately not offered here: it reports
    // scheduler drift but does not reconcile it, so pointing at it
    // would send the user to a command that changes nothing.
    lines.push(style.dim("Reset with `crew autoupdate disable` then `crew autoupdate enable`."));
  }
  return lines;
}
