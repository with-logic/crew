/**
 * The `--all` path for `crew uninstall` (§5.3.1, §7.4).
 *
 * `--all` names no skills, so it needs its own target construction and a
 * confirmation gate. Counting happens before the state lock is taken, so
 * the prompt never blocks a lock a concurrent command is waiting on.
 */

import { CrewError } from "../../core/errors.ts";
import type { Scope, StateFile } from "../../core/types.ts";
import { plural, shortenHome } from "../../util/format.ts";
import type { CommandContext } from "../types.ts";
import { entriesAtScope, narrowSubjectToScope } from "./scope.ts";
import { groupByName, type UninstallTarget } from "./select.ts";

/**
 * Every installed skill at the target scope, one target per name. Throws
 * when there is nothing to do; confirmation is the caller's job, since it
 * must happen before the state lock is taken.
 */
export function allTargets(ctx: CommandContext, state: StateFile): readonly UninstallTarget[] {
  const entries = entriesAtScope(state.installations, ctx.flags.scope, ctx.cwd);
  if (entries.length === 0) {
    throw new CrewError(
      "not_installed_here",
      `nothing is installed at ${describeScope(ctx.flags.scope, ctx.cwd)} — nothing to remove`,
      { scope: ctx.flags.scope },
    );
  }
  return groupByName(entries).map(
    (subject) =>
      ({
        kind: "skill",
        subject: narrowSubjectToScope(subject, ctx.flags.scope, ctx.cwd, ctx.flags.force),
      }) as const,
  );
}

/** Validate `--all` targets, then confirm their actual location before locking. */
export function confirmAll(ctx: CommandContext, state: StateFile): void {
  if (ctx.positional.length > 0) {
    throw new CrewError(
      "usage_error",
      "`crew uninstall --all` takes no skill names — it removes everything at the target scope",
      { positional: [...ctx.positional] },
    );
  }
  const targets = allTargets(ctx, state);
  if (ctx.flags.yes) return;
  // The lone-project fallback can target a recorded root unlike the cwd.
  const root = targets[0]!.subject.entries[0]!.project_root ?? ctx.cwd;
  const scope = describeScope(ctx.flags.scope, root);
  const answer = ctx.prompt(
    `Remove ${plural(targets.length, "skill")} from ${scope}? [y/N]: `,
    "no",
  );
  if (answer === "yes") return;
  if (answer === "no") {
    throw new CrewError("usage_error", "Aborted — nothing was removed", { scope: ctx.flags.scope });
  }
  throw new CrewError(
    "usage_error",
    "`crew uninstall --all` needs confirmation, but stdin isn't a terminal — pass `--yes` to confirm",
    { scope: ctx.flags.scope },
  );
}

function describeScope(scope: Scope, cwd: string): string {
  return scope === "user" ? "user scope" : `project scope in ${shortenHome(cwd)}`;
}
