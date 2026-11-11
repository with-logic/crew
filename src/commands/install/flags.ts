/**
 * Two checks `crew install` makes on its reference flags: reading the kind
 * hint (`--tap`, `--bundle`, `--skill`, §8.3) and refusing `--recursive`
 * with a tap-name reference (§5.3). `--from-git` is handled in
 * `./from-git.ts`.
 */

import { CrewError } from "../../core/errors.ts";
import type { KindHint } from "../../install/resolve-ref/index.ts";
import { parseRef } from "../../refs/parse.ts";
import type { CommandContext } from "../types.ts";

/** Read --tap / --bundle / --skill, enforce mutual exclusivity. */
export function readKindHint(ctx: CommandContext): KindHint {
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

/** `--recursive` is for direct git and path sources; a tap-name reference with it is a usage error. */
export function rejectRecursiveTapRefs(ctx: CommandContext): void {
  if (!ctx.flags.extras["recursive"]) return;
  for (const raw of ctx.positional) {
    const source = parseRef(raw, ctx.cwd);
    if (source.type !== "tap") continue;
    throw new CrewError(
      "usage_error",
      "`--recursive` only applies to direct git or path sources — for tap-name installs, run `crew tap add --recursive <url-or-path> <name>` first",
    );
  }
}
