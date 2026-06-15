/**
 * Autoupdate log parser (§10.2).
 *
 * Both launchd and systemd backends write the same line format, so status
 * reads the log through this shared parser instead of a platform backend.
 */

import { readFileSync } from "node:fs";
import { crewHome, paths } from "../core/paths.ts";
import { exists } from "../util/fs.ts";

/** Read the last line of the autoupdate log (if any). */
export function readAutoupdateLogTail(home: string = crewHome()): {
  last_run: string | null;
  last_exit_status: number | null;
  last_line: string | null;
} {
  const p = paths(home).autoupdateLog;
  if (!exists(p)) {
    return { last_run: null, last_exit_status: null, last_line: null };
  }
  const contents = readFileSync(p, "utf8");
  const lines = contents.split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { last_run: null, last_exit_status: null, last_line: null };
  }
  const lastLine = lines[lines.length - 1]!;
  const parsed = lastLine.match(/^crew-autoupdate (\S+) exit=(\d+)$/);
  return {
    last_run: parsed ? parsed[1]! : null,
    last_exit_status: parsed ? Number.parseInt(parsed[2]!, 10) : null,
    last_line: lastLine,
  };
}
