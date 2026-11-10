/**
 * Positional-reference disambiguation for `crew install` (§8.3, §16.4).
 */

import type { Config } from "../../core/types.ts";
import { detectCollision } from "../../install/collision-check.ts";
import type { KindHint } from "../../install/resolve-ref/index.ts";
import type { GitDiscoveryWarnings } from "../../sources/discovery.ts";
import { withTapLocks } from "../../sources/tap-lock.ts";
import type { CommandContext } from "../types.ts";
import { promptBareNameAmbiguity } from "./ambiguity-prompt.ts";
import { promptForCollision } from "./collision-prompt.ts";

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
export function resolveCollisions(
  ctx: CommandContext,
  config: Config,
  discovery: GitDiscoveryWarnings,
  kindHint: KindHint,
): string[] {
  const refs: string[] = [];
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
    const collision = withTapLocks(config.taps, ctx.home, () =>
      detectCollision(canonical, config, ctx.home, discovery),
    );
    if (collision && !ctx.flags.yes) {
      refs.push(promptForCollision(ctx, collision, canonical, raw, discovery));
      continue;
    }
    if (collision) {
      refs.push(raw);
      continue;
    }
    // No tap-vs-other-tap-skill collision. Check for bare-name
    // ambiguity across skills and namespaces (§8.3).
    refs.push(promptBareNameAmbiguity(ctx, config, canonical, raw, discovery));
  }
  return refs;
}

const BARE_NAME = /^[a-z0-9][a-z0-9-]*$/i;

function isBareName(s: string): boolean {
  return BARE_NAME.test(s);
}
