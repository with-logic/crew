/**
 * `crew install <ref> [<ref>...]` (§5.1).
 *
 * Thin command wrapper: reads config, resolves any tap/skill-name
 * collision prompts, runs the install flow, and hands the result to
 * `./render.ts` for human output.
 */

import { readConfig } from "../../config/load.ts";
import { CrewError } from "../../core/errors.ts";
import type { Config, TapConfig } from "../../core/types.ts";
import { countSkills, detectCollision } from "../../install/collision-check.ts";
import { runInstall } from "../../install/flow.ts";
import type { KindHint } from "../../install/resolve-ref/index.ts";
import type { CommandContext, CommandOutput } from "../types.ts";
import { promptBareNameAmbiguity } from "./ambiguity-prompt.ts";
import { renderInstall } from "./render/index.ts";

/** Read --tap / --bundle / --skill, enforce mutual exclusivity. */
function readKindHint(ctx: CommandContext): KindHint {
  const tap = Boolean(ctx.flags.extras["tap"]);
  const bundle = Boolean(ctx.flags.extras["bundle"]);
  const skill = Boolean(ctx.flags.extras["skill"]);
  const count = Number(tap) + Number(bundle) + Number(skill);
  if (count > 1) {
    throw new CrewError(
      "usage_error",
      "`--tap`, `--bundle`, and `--skill` are mutually exclusive — pick one",
    );
  }
  if (tap) return "tap";
  if (bundle) return "namespace";
  if (skill) return "skill";
  return null;
}

export function installCommand(ctx: CommandContext): CommandOutput {
  if (ctx.positional.length === 0) {
    throw new CrewError(
      "usage_error",
      "`crew install` needs at least one skill reference — e.g. `crew install python-testing`, `crew install @acme/skills`, or `crew install ./my-skill`",
    );
  }
  const kindHint = readKindHint(ctx);
  const config = readConfig(ctx.home);
  const refs = resolveCollisions(ctx, config);
  const result = runInstall(config, {
    refs,
    scope: ctx.flags.scope,
    force: ctx.flags.force,
    dryRun: ctx.flags.dryRun,
    restrictAgents: ctx.flags.agent,
    cwd: ctx.cwd,
    home: ctx.home,
    kindHint,
  });

  // Exit-code rules (§18.6 clarification): exit 1 if any root skill has
  // zero successful targets OR if any skill was skipped during
  // multi-skill expansion; otherwise 0. The clean "already installed"
  // short-circuit case is exit 0 per §5.4.
  const allAlreadyInstalled =
    result.alreadyInstalled.length > 0 && result.summary.records.length === 0;
  let exitCode = 0;
  if (result.skipped.length > 0) exitCode = 1;
  if (!allAlreadyInstalled) {
    const anyRootFail = result.summary.records.some((r) => !r.anySuccess);
    if (anyRootFail) exitCode = 1;
  }

  const human = renderInstall(
    {
      records: result.summary.records,
      alreadyInstalled: result.alreadyInstalled,
      resolved: result.resolved,
      skipped: result.skipped,
      dryRun: ctx.flags.dryRun,
      cwd: ctx.cwd,
      width: ctx.width,
    },
    ctx.style,
  );

  return {
    exitCode,
    human,
    json: {
      already_installed: result.alreadyInstalled,
      records: result.summary.records,
      skipped: result.skipped,
      dry_run: ctx.flags.dryRun,
    },
  };
}

/**
 * Walk each positional and resolve the tap-vs-skill collision case
 * described in §16.4. A positional matching both a tap name AND a
 * same-named skill in one or more other taps triggers a prompt:
 *   - exactly one other tap → binary [Y/n]. Enter/Y picks the tap,
 *     n picks the one other skill.
 *   - two or more other taps → numbered menu [1..N]. Choice 1 is the
 *     tap (the default); 2..N are the qualified skills in config
 *     order.
 * `--yes` or non-TTY short-circuit per the spec. Returns the
 * (possibly-rewritten) refs the install flow should run with.
 *
 * Non-bare positionals (paths, git URLs, `<tap>/<skill>`) are passed
 * through unchanged.
 */
function resolveCollisions(ctx: CommandContext, config: Config): string[] {
  const refs: string[] = [];
  const kindHint = readKindHint(ctx);
  for (const raw of ctx.positional) {
    const trimmed = raw.trim();
    if (!isBareName(trimmed)) {
      refs.push(raw);
      continue;
    }
    // Kind hints skip prompting entirely — the user told us what they meant.
    if (kindHint !== null) {
      refs.push(raw);
      continue;
    }
    const collision = detectCollision(trimmed, config, ctx.home);
    if (collision && !ctx.flags.yes) {
      refs.push(promptForCollision(ctx, collision, trimmed, raw));
      continue;
    }
    if (collision) {
      refs.push(raw);
      continue;
    }
    // No tap-vs-other-tap-skill collision. Check for bare-name
    // ambiguity across skills and namespaces (§8.3).
    refs.push(promptBareNameAmbiguity(ctx, config, trimmed, raw));
  }
  return refs;
}

function promptForCollision(
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

function abortError(
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

const BARE_NAME = /^[a-z0-9][a-z0-9-]*$/i;

function isBareName(s: string): boolean {
  return BARE_NAME.test(s);
}
