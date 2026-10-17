/**
 * The lines `crew install` prints under a skill whose tap or tracking it
 * changed (§5.4, §11.1; C-INST-13o): where it moved, and whether updates
 * now install its tap's new skills. A skill with no change gets none.
 */

import type { AttributionChange } from "../../../install/attribution-changes.ts";
import type { Styler } from "../../../util/term.ts";

/** Dim, indented lines for `name`'s change in `changes`; [] when there is none. */
export function changeLines(
  changes: readonly AttributionChange[],
  name: string,
  dryRun: boolean,
  style: Styler,
): string[] {
  const change = changes.find((c) => c.name === name);
  if (change === undefined) return [];
  const lines: string[] = [];
  if (change.moved_from !== undefined) {
    const verb = dryRun ? "would move" : "moved";
    lines.push(`${verb} from ${change.moved_from} to ${change.tap}`);
  }
  if (change.tracks_tap === true) {
    const verb = dryRun ? "would track" : "now tracks";
    lines.push(`${verb} ${change.tap}: updates install its new skills`);
  }
  if (change.tracks_tap === false) {
    const verb = dryRun ? "would stop tracking" : "no longer tracks";
    lines.push(`${verb} ${change.tap}: updates won't install its new skills`);
  }
  return lines.map((line) => style.dim(`    ${line}`));
}
