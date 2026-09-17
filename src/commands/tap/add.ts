/**
 * `crew tap add <url-or-path> [<name>]` (§16.3). Four outcomes:
 * *added* (new tap row; git taps clone first), *no-op* (same target
 * already configured as registered), *promoted* (same target already
 * backs an auto tap — see `./promote.ts`), *updated* (same registered
 * target upgraded to recursive discovery).
 *
 * `planAdd` is a read-only planner: it decides the outcome from config,
 * throws the usage errors, and stats a path target to confirm it is a
 * directory. It writes nothing and never touches the network, so
 * `--dry-run` reports the outcome without cloning or writing (§16.3).
 * The clone is the one validation a preview cannot perform.
 */

import { readConfig, writeConfig } from "../../config/load.ts";
import { CrewError } from "../../core/errors.ts";
import type { Config, TapConfig } from "../../core/types.ts";
import { rewriteTapMarkers } from "../../install/rewrite-tap-markers.ts";
import { displayText } from "../../refs/display-url.ts";
import { NAME_PATTERN } from "../../refs/parse.ts";
import { readState } from "../../state/load.ts";
import { withStateLock } from "../../state/lock.ts";
import { isDirectory } from "../../util/fs.ts";
import type { CommandContext, CommandOutput } from "../types.ts";
import { cloneNewTap, deriveName, newTapOf } from "./new-tap.ts";
import { promoteExistingTap } from "./promote.ts";
import { renderTapAdd, type TapAddOutcome } from "./render/add.ts";
import { displayTarget, parseTapAddTarget, sameTap, type TapAddTarget } from "./target.ts";

/**
 * What `planAdd` decided. The outcomes that act on an existing row carry
 * it in the variant, so `applyAdd` can't reach for a row that isn't there.
 */
type TapAddPlan =
  | { readonly outcome: "added" }
  | { readonly outcome: "no-op" }
  | { readonly outcome: "updated"; readonly sameTarget: TapConfig }
  | { readonly outcome: "promoted"; readonly sameTarget: TapConfig };

/**
 * The resolved arguments of one `tap add` invocation. Named because
 * `name`, `rawArg`, and `explicitName` are all strings: positionally
 * they are interchangeable to the compiler, and swapping two would
 * typecheck while silently misreporting the tap being added.
 */
interface TapAddInput {
  /** The tap name to use: `explicitName` when given, else derived. */
  readonly name: string;
  /** The source exactly as the user typed it, for error messages. */
  readonly rawArg: string;
  /** The name argument, when the user supplied one. */
  readonly explicitName: string | undefined;
  readonly target: TapAddTarget;
  readonly recursive: boolean;
}

export function tapAdd(ctx: CommandContext, args: readonly string[]): CommandOutput {
  if (args.length < 1)
    throw new CrewError(
      "usage_error",
      "`crew tap add` needs a git URL or local path — e.g. `crew tap add https://github.com/acme/skills.git acme`",
    );
  const rawArg = args[0]!;
  const target = parseTapAddTarget(rawArg, ctx.cwd);
  const explicitName = args[1];
  const name = explicitName ?? deriveName(target);
  const recursive = Boolean(ctx.flags.extras["recursive"]);
  if (!NAME_PATTERN.test(name)) {
    throw new CrewError(
      "usage_error",
      `tap name \`${name}\` has invalid characters — use lowercase letters, digits, and hyphens only (starting with an alphanumeric, not a hyphen)`,
      { name },
    );
  }
  const input: TapAddInput = { name, rawArg, explicitName, target, recursive };
  if (ctx.flags.dryRun) {
    // Read-only preview: no lock, no clone, no config write (§16.3).
    const plan = planAdd(readConfig(ctx.home), input);
    return renderTapAdd(plan.outcome, name, target, true, ctx.style);
  }
  // Wrap in an object so TS doesn't narrow the literal type via the
  // initial assignment — `withStateLock`'s callback assigns later but
  // TS doesn't trace control flow into closures.
  const out: { value: TapAddOutcome } = { value: "added" };
  withStateLock(() => {
    const config = readConfig(ctx.home);
    const plan = planAdd(config, input);
    applyAdd(ctx, config, plan, input);
    out.value = plan.outcome;
  }, ctx.home);
  return renderTapAdd(out.value, name, target, false, ctx.style);
}

/**
 * Decide the outcome from config; throws the usage errors. Reads the
 * filesystem only to confirm a path target is a directory.
 */
function planAdd(config: Config, input: TapAddInput): TapAddPlan {
  const { name, rawArg, explicitName, target, recursive } = input;
  const sameTarget = config.taps.find((t) => sameTap(t, target));
  if (sameTarget) {
    if (sameTarget.registered && (explicitName === undefined || explicitName === sameTarget.name)) {
      const upgrade = recursive && sameTarget.discovery !== "recursive";
      return upgrade ? { outcome: "updated", sameTarget } : { outcome: "no-op" };
    }
    return { outcome: "promoted", sameTarget };
  }
  const sameName = config.taps.find((t) => t.name === name);
  if (sameName) {
    throw new CrewError(
      "usage_error",
      // `rawArg` is echoed back as a runnable command, so it must be redacted
      // too: otherwise the remedy itself publishes the user's credentials.
      `tap \`${name}\` is already configured at \`${displayTarget(sameName)}\` — to add this one under a different name, run \`crew tap add ${displayText(rawArg)} <tap-name>\``,
      { name, existing: displayTarget(sameName), incoming: displayTarget(target) },
    );
  }
  if (target.kind === "path" && !isDirectory(target.path))
    throw new CrewError(
      "usage_error",
      `\`${target.path}\` isn't a directory — \`crew tap add\` needs an existing local path`,
      { path: target.path },
    );
  return { outcome: "added" };
}

/**
 * The write-under-lock flow for a planned outcome. Every variant is
 * handled by name, so a new outcome is a compile error at the
 * `satisfies` below rather than silently inheriting clone-and-write.
 */
function applyAdd(ctx: CommandContext, config: Config, plan: TapAddPlan, input: TapAddInput): void {
  const { name, explicitName, target, recursive } = input;
  if (plan.outcome === "no-op") return;
  if (plan.outcome === "updated") {
    const existing = plan.sameTarget;
    writeConfig(
      {
        ...config,
        taps: config.taps.map((t) =>
          t.name === existing.name ? { ...t, discovery: "recursive" } : t,
        ),
      },
      ctx.home,
    );
    rewriteTapMarkers(
      { oldName: existing.name, newName: existing.name, discovery: "recursive" },
      readState(ctx.home).installations,
      ctx.cwd,
    );
    return;
  }
  if (plan.outcome === "promoted") {
    promoteExistingTap(
      ctx.home,
      ctx.cwd,
      config,
      plan.sameTarget,
      target.kind,
      explicitName,
      recursive,
    );
    return;
  }
  // `added` is the only remaining variant. `satisfies` makes a newly
  // added `TapAddPlan` outcome a compile error here rather than letting
  // it inherit the clone-and-write path, without costing an unreachable
  // branch under the 100% coverage gate.
  plan satisfies Extract<TapAddPlan, { outcome: "added" }>;
  if (target.kind === "git") cloneNewTap(name, target.url, ctx.home);
  writeConfig({ ...config, taps: [...config.taps, newTapOf(name, target, recursive)] }, ctx.home);
}
