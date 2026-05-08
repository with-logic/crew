/**
 * `crew install <ref> [<ref>...]` (§5.1).
 *
 * Thin command wrapper: reads config, resolves any tap/skill-name
 * collision prompts, runs the install flow, and hands the result to
 * `./render.ts` for human output.
 */

import { readConfig } from "../../config/load.ts";
import { CrewError } from "../../core/errors.ts";
import type { Config } from "../../core/types.ts";
import { detectCollision } from "../../install/collision-check.ts";
import { runInstall } from "../../install/flow.ts";
import type { KindHint } from "../../install/resolve-ref/index.ts";
import type { CommandContext, CommandOutput } from "../types.ts";
import { promptBareNameAmbiguity } from "./ambiguity-prompt.ts";
import { promptForCollision } from "./collision-prompt.ts";
import { withKnownTapInstallSuggestions } from "./known-tap-fallback/index.ts";
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
  const installOptions = {
    refs,
    scope: ctx.flags.scope,
    force: ctx.flags.force,
    dryRun: ctx.flags.dryRun,
    restrictAgents: ctx.flags.agent,
    cwd: ctx.cwd,
    home: ctx.home,
    kindHint,
  };
  let result: ReturnType<typeof runInstall>;
  try {
    result = runInstall(config, installOptions);
  } catch (err) {
    if (!(err instanceof CrewError)) throw err;
    throw withKnownTapInstallSuggestions(err, refs, config, ctx.cwd, kindHint);
  }

  // Exit-code rules (PRD §9 step 9). Per-skill outcome is
  // "succeeded" iff the skill validated AND at least one agent
  // install succeeded. Validation failures land in result.skipped;
  // agent-level failures live in result.summary.records with
  // `anySuccess === false`.
  const succeeded = result.summary.records.filter((r) => r.anySuccess).length;
  const operationalFailures = result.summary.records.filter((r) => !r.anySuccess).length;
  const validationFailures = result.skipped.length;
  const failed = operationalFailures + validationFailures;
  const allAlreadyInstalled =
    result.alreadyInstalled.length > 0 && result.summary.records.length === 0;
  let exitCode = 0;
  if (failed === 0) {
    exitCode = 0; // Every attempted skill succeeded, or nothing to do.
  } else if (succeeded > 0 || allAlreadyInstalled) {
    exitCode = 1; // Partial success.
  } else if (validationFailures > 0) {
    exitCode = 4; // Zero succeeded; at least one invalid skill.
  } else {
    exitCode = 1; // Zero succeeded; purely operational failures.
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
    const canonical = trimmed.toLowerCase();
    if (!isBareName(trimmed)) {
      refs.push(raw);
      continue;
    }
    // Kind hints skip prompting entirely — the user told us what they meant.
    if (kindHint !== null) {
      refs.push(raw);
      continue;
    }
    const collision = detectCollision(canonical, config, ctx.home);
    if (collision && !ctx.flags.yes) {
      refs.push(promptForCollision(ctx, collision, canonical, raw));
      continue;
    }
    if (collision) {
      refs.push(raw);
      continue;
    }
    // No tap-vs-other-tap-skill collision. Check for bare-name
    // ambiguity across skills and namespaces (§8.3).
    refs.push(promptBareNameAmbiguity(ctx, config, canonical, raw));
  }
  return refs;
}

const BARE_NAME = /^[a-z0-9][a-z0-9-]*$/i;

function isBareName(s: string): boolean {
  return BARE_NAME.test(s);
}
