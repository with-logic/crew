/**
 * Bare-name ambiguity prompt for `crew install` (§8.3).
 *
 * When a bare name matches more than one of (skill in tap, namespace,
 * whole-tap) across configured taps, ask the user. On a TTY this is
 * an interactive numbered menu; on a pipe / `--yes` / explicit abort
 * it raises `ambiguous_reference` with copy-pasteable commands.
 *
 * This is complementary to, not replacing, the tap-vs-other-tap-skill
 * collision prompt that `./index.ts` runs first.
 */

import { CrewError } from "../../core/errors.ts";
import type { Config } from "../../core/types.ts";
import { enumerateCandidates, type NameCandidate } from "../../install/attribute-bare-name.ts";
import { formatCandidate, shortLabelFor } from "../../install/resolve-ref/index.ts";
import type { CommandContext } from "../types.ts";

/**
 * Strip candidates that the legacy tap-vs-other-tap collision pass
 * (`detectCollision`) already handles — specifically, a skill named
 * the same thing in the SAME tap whose name the user typed. Tap wins
 * for that case per §16.4.
 */
function filterForAmbiguity(
  candidates: readonly NameCandidate[],
  name: string,
): readonly NameCandidate[] {
  const tapCandidate = candidates.find((c) => c.kind === "tap");
  if (!tapCandidate) return candidates;
  return candidates.filter((c) => {
    if (c.kind === "tap") return true;
    // Drop a skill candidate that lives inside the same-named tap.
    if (c.kind === "skill" && c.tap.name === name) return false;
    // Drop a namespace candidate inside the same-named tap.
    if (c.kind === "namespace" && c.tap.name === name) return false;
    return true;
  });
}

/**
 * Resolve bare-name ambiguity. Returns the (possibly-rewritten) ref
 * to hand to the install flow. Throws `ambiguous_reference` when the
 * user aborts or stdin isn't a TTY.
 */
export function promptBareNameAmbiguity(
  ctx: CommandContext,
  config: Config,
  trimmed: string,
  raw: string,
): string {
  const candidates = filterForAmbiguity(
    enumerateCandidates(trimmed, config, ctx.home),
    trimmed,
  );
  if (candidates.length <= 1) return raw;
  if (ctx.flags.yes) return raw;

  const choiceCount = candidates.length + 1; // +1 for abort
  const lines: string[] = [`\`${trimmed}\` is ambiguous — pick one:`];
  for (let i = 0; i < candidates.length; i++) {
    lines.push(`  [${i + 1}] ${shortLabelFor(candidates[i]!, trimmed)}`);
  }
  lines.push(`  [${choiceCount}] abort`);
  lines.push(`Choice [1-${choiceCount}, default 1]: `);

  const answer = ctx.promptChoice(lines.join("\n"), choiceCount);
  if (answer === "abort" || answer.index === choiceCount - 1) {
    const errLines: string[] = [
      `\`${trimmed}\` is ambiguous across taps, skills, and namespaces`,
      "",
      "  Rerun with one of:",
      "",
    ];
    for (const c of candidates) errLines.push(`    ${formatCandidate(c, trimmed)}`);
    throw new CrewError("ambiguous_reference", errLines.join("\n"), {
      name: trimmed,
      candidates: candidates.map((c) => formatCandidate(c, trimmed)),
    });
  }

  const chosen = candidates[answer.index]!;
  if (chosen.kind === "tap") return chosen.tap.name;
  if (chosen.kind === "namespace") return `${chosen.tap.name}/${chosen.namespace}`;
  const ns = chosen.location.namespace;
  return ns ? `${chosen.tap.name}/${ns}/${trimmed}` : `${chosen.tap.name}/${trimmed}`;
}
