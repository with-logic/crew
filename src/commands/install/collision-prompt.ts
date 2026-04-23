/**
 * Tap-vs-other-tap-skill collision prompt (§16.4).
 *
 * A bare positional `foo` that matches both a configured tap name
 * AND a same-named skill in one or more OTHER taps triggers this
 * prompt. Binary Y/n for a single other tap; numbered menu for two
 * or more. The CLI's `installCommand` calls `resolveCollisions`
 * first, which delegates to `promptForCollision` here.
 *
 * This module is focused enough to keep the top-level command file
 * under the 200-line cap.
 */

import { CrewError } from "../../core/errors.ts";
import type { TapConfig } from "../../core/types.ts";
import { countSkills } from "../../install/collision-check.ts";
import type { CommandContext } from "../types.ts";

export function promptForCollision(
  ctx: CommandContext,
  collision: { tap: TapConfig; otherTaps: readonly TapConfig[] },
  trimmed: string,
  raw: string,
): string {
  const count = countSkills(collision.tap, ctx.home);
  const skillsLine = count === null ? "" : ` (${count} skill${count === 1 ? "" : "s"})`;
  const qualifiedFor = (t: TapConfig): string => `${t.name}/${trimmed}`;

  if (collision.otherTaps.length === 1) {
    const other = collision.otherTaps[0]!;
    const qualified = qualifiedFor(other);
    const message =
      `\`${trimmed}\` matches both a tap and a skill (from ${other.name}).\n` +
      `  [Y] install tap \`${trimmed}\`${skillsLine}\n` +
      `  [n] install skill \`${qualified}\`\n` +
      `Choice [Y/n]: `;
    const answer = ctx.prompt(message);
    if (answer === "abort") throw abortError(collision, trimmed);
    if (answer === "no") return qualified;
    return raw;
  }

  // Two or more other taps host the same-named skill. The binary Y/n
  // can't name them all, so render a numbered menu. Choice 1 is the
  // tap (default); 2..N are the skills in config order.
  const choiceCount = 1 + collision.otherTaps.length;
  const lines: string[] = [
    `\`${trimmed}\` matches a tap and skills in ${collision.otherTaps.length} other taps.`,
    `  [1] install tap \`${trimmed}\`${skillsLine}`,
  ];
  for (let i = 0; i < collision.otherTaps.length; i++) {
    lines.push(`  [${i + 2}] install skill \`${qualifiedFor(collision.otherTaps[i]!)}\``);
  }
  lines.push(`Choice [1-${choiceCount}, default 1]: `);
  const answer = ctx.promptChoice(lines.join("\n"), choiceCount);
  if (answer === "abort") throw abortError(collision, trimmed);
  if (answer.index === 0) return raw;
  return qualifiedFor(collision.otherTaps[answer.index - 1]!);
}

export function abortError(
  collision: { tap: TapConfig; otherTaps: readonly TapConfig[] },
  trimmed: string,
): CrewError {
  const qualifieds = collision.otherTaps.map((t) => `\`${t.name}/${trimmed}\``).join(", ");
  const message =
    collision.otherTaps.length === 1
      ? `\`${trimmed}\` is both a tap name and a skill name (in ${collision.otherTaps[0]!.name}) — pass --yes to install the tap, or qualify the skill as ${qualifieds}`
      : `\`${trimmed}\` is both a tap name and a skill name (in ${collision.otherTaps.length} other taps) — pass --yes to install the tap, or qualify a skill as one of: ${qualifieds}`;
  return new CrewError("usage_error", message, {
    name: trimmed,
    tap: collision.tap.name,
    otherTaps: collision.otherTaps.map((t) => t.name),
  });
}
