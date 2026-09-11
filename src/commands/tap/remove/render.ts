/**
 * Human output for `crew tap remove` (§16.3).
 *
 * Three shapes share one renderer: a plain removal, a `--uninstall`
 * run whose per-skill blocks print first, and a `--force` removal that
 * warns about the skills it left installed.
 */

import { plural } from "../../../util/format.ts";
import type { Styler } from "../../../util/term.ts";
import type { UninstallRecord } from "../../uninstall/core.ts";
import { renderUninstall } from "../../uninstall/render.ts";

/** Everything the remove renderer needs. See `./index.ts` for the flow. */
export interface RenderTapRemoveInput {
  readonly name: string;
  readonly kind: "git" | "path";
  readonly dryRun: boolean;
  /** False when a skill removal aborted and the tap was left in place. */
  readonly tapRemoved: boolean;
  /** `<skill> (<scope>)` labels kept installed by `--force` (§16.3). */
  readonly kept: readonly string[];
  /** Per-skill records when `--uninstall` removed the attached skills. */
  readonly uninstalled?: readonly UninstallRecord[];
  readonly style: Styler;
}

export function renderTapRemove(input: RenderTapRemoveInput): string[] {
  const { name, kind, dryRun, tapRemoved, kept, uninstalled, style } = input;
  const tag = dryRun ? style.dim(" (dry run)") : "";
  const lines: string[] = [];

  // `--uninstall`: the skill blocks read first, then the tap line.
  if (uninstalled && uninstalled.length > 0) {
    lines.push(...renderUninstall(uninstalled, style));
    lines.push("");
  }

  if (!tapRemoved) {
    lines.push(
      `${style.symbol("fail")} Kept tap ${style.bold(name)} ${style.dim("(a skill couldn't be removed)")}`,
    );
    lines.push(style.dim(`  fix the failure above, or retry with \`--force --uninstall\``));
    return lines;
  }

  lines.push(
    `${style.symbol("ok")} ${dryRun ? "Would remove" : "Removed"} tap ${style.bold(name)}${tag}`,
  );
  if (kind === "git") {
    lines.push(style.dim(dryRun ? "  local clone would be deleted" : "  local clone deleted"));
  } else {
    const verb = dryRun ? "wouldn't be" : "wasn't";
    lines.push(style.dim(`  (the local folder itself ${verb} touched)`));
  }
  if (kept.length > 0) {
    lines.push("");
    lines.push(
      `${style.symbol("warn")} ${plural(kept.length, "skill")} ${dryRun ? "would stay" : "stayed"} installed: ${kept.join(", ")}`,
    );
    lines.push(
      style.dim(
        `  they keep working; \`crew update\` will report them as \`tap_missing\` until you re-add the tap`,
      ),
    );
  }
  return lines;
}
