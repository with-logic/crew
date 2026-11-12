/**
 * What `crew install --quiet` still says (§5.2, §9 step 11): `--quiet`
 * suppresses the summary, which is where a failed skill's reason is
 * printed, so each failure is reported on stderr instead.
 */

import type { InstallRecord } from "../../install/perform/index.ts";
import type { SkippedSkill } from "../../sources/expand.ts";
import { safePath } from "../../util/redact.ts";
import { failureLine } from "../failure-line.ts";
import type { CommandContext } from "../types.ts";

/** The parts of an install's result that can hold a failure. */
interface InstallFailures {
  readonly skipped: readonly SkippedSkill[];
  readonly summary: { readonly records: readonly InstallRecord[] };
}

/**
 * Under `--quiet`, one stderr line per skill that failed validation and per
 * agent a skill could not be installed into; nothing otherwise. A run with
 * no failure yields no line, so a successful quiet install stays silent.
 */
export function quietInstallFailures(result: InstallFailures, ctx: CommandContext): string[] {
  if (!ctx.flags.quiet) return [];
  const lines: string[] = [];
  for (const skill of result.skipped) {
    lines.push(failureLine(safePath(skill.path), skill.code, skill.message));
  }
  for (const record of result.summary.records) {
    for (const agent of record.agents) {
      if (agent.kind !== "failed") continue;
      lines.push(
        failureLine(`${record.name}: ${agent.agent}`, agent.error.code, agent.error.message),
      );
    }
  }
  return lines;
}
