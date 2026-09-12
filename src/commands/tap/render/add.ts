/**
 * Human-friendly output for `crew tap add` (§16.3).
 *
 * Split from the other tap renderers because add has four outcomes of
 * its own and its own dry-run wording; keeping it here holds both files
 * under the 200-line cap.
 *
 * Under `--dry-run` the same shape is rendered with "would …" verbs and
 * a dim "(dry run)" tag, and the JSON payload carries `dry_run: true`.
 */

import type { Styler } from "../../../util/term.ts";
import type { CommandOutput } from "../../types.ts";
import { displayTarget, payloadOf, type TapAddTarget } from "../target.ts";

/** What `crew tap add` decided to do (or would do, under `--dry-run`). */
export type TapAddOutcome = "added" | "no-op" | "promoted" | "updated";

export function renderTapAdd(
  outcome: TapAddOutcome,
  name: string,
  target: TapAddTarget,
  dryRun: boolean,
  style: Styler,
): CommandOutput {
  const targetStr = displayTarget(target);
  const tag = dryRun ? style.dim(" (dry run)") : "";
  const payload = { name, ...payloadOf(target), ...(dryRun ? { dry_run: true } : {}) };
  if (outcome === "no-op") {
    return {
      exitCode: 0,
      human: [
        `${style.symbol("muted")} Tap ${style.bold(name)} is already set up${tag}`,
        style.dim(`  pointed at ${targetStr}`),
      ],
      json: { ...payload, already: true },
    };
  }
  if (outcome === "promoted") {
    const verb = dryRun ? "Would promote" : "Promoted";
    return {
      exitCode: 0,
      human: [
        `${style.symbol("ok")} ${verb} ${style.bold(name)} to a saved tap${tag}`,
        style.dim(`  ${dryRun ? "would track" : "now tracking"} ${targetStr}`),
      ],
      json: { ...payload, promoted: true },
    };
  }
  if (outcome === "updated") {
    const verb = dryRun ? "Would update" : "Updated";
    return {
      exitCode: 0,
      human: [
        `${style.symbol("ok")} ${verb} tap ${style.bold(name)}${tag}`,
        style.dim(`  recursive discovery ${dryRun ? "would be " : ""}enabled for ${targetStr}`),
      ],
      json: { ...payload, updated: true, discovery: "recursive" },
    };
  }
  // `added` is the only remaining outcome. `satisfies` makes a newly
  // added `TapAddOutcome` a compile error here rather than letting it
  // render as a successful add, without costing an unreachable branch.
  outcome satisfies "added";
  const human = [
    `${style.symbol("ok")} ${dryRun ? "Would add" : "Added"} tap ${style.bold(name)}${tag}`,
    style.dim(`  from ${targetStr}`),
  ];
  if (!dryRun)
    human.push(style.dim("  try `crew search <query>` or `crew install <name>` to use it"));
  return { exitCode: 0, human, json: payload };
}
