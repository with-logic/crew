/**
 * `crew tap add <url-or-path> [<name>]` (§16.3). Four outcomes:
 * *added* (new tap row; git taps clone first), *no-op* (same target
 * already configured as registered), *promoted* (same target already
 * backs an auto tap — see `./promote.ts`), *updated* (same registered
 * target upgraded to recursive discovery).
 *
 * Planning (`planAdd`) is pure — it reads config and decides the
 * outcome or throws the usage errors — so `--dry-run` can report the
 * outcome without cloning or writing anything (§16.3).
 */

import { readConfig, writeConfig } from "../../config/load.ts";
import { CrewError } from "../../core/errors.ts";
import { tapPath } from "../../core/paths.ts";
import type { Config, TapConfig } from "../../core/types.ts";
import { ensureClone } from "../../git/repo.ts";
import { rewriteTapMarkers } from "../../install/rewrite-tap-markers.ts";
import { deriveAutoTapName } from "../../install/tap-naming.ts";
import { NAME_PATTERN } from "../../refs/parse.ts";
import { readState } from "../../state/load.ts";
import { withStateLock } from "../../state/lock.ts";
import { exists, isDirectory, rmrf } from "../../util/fs.ts";
import type { CommandContext, CommandOutput } from "../types.ts";
import { promoteExistingTap } from "./promote.ts";
import { renderTapAdd, type TapAddOutcome } from "./render.ts";
import { displayTarget, parseTapAddTarget, sameTap, type TapAddTarget } from "./target.ts";

/** What `planAdd` decided, plus the existing row it applies to (if any). */
interface TapAddPlan {
  readonly outcome: TapAddOutcome;
  readonly sameTarget: TapConfig | undefined;
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
  if (ctx.flags.dryRun) {
    // Read-only preview: no lock, no clone, no config write (§16.3).
    const plan = planAdd(readConfig(ctx.home), name, rawArg, explicitName, target, recursive);
    return renderTapAdd(plan.outcome, name, target, true, ctx.style);
  }
  // Wrap in an object so TS doesn't narrow the literal type via the
  // initial assignment — `withStateLock`'s callback assigns later but
  // TS doesn't trace control flow into closures.
  const out: { value: TapAddOutcome } = { value: "added" };
  withStateLock(() => {
    const config = readConfig(ctx.home);
    const plan = planAdd(config, name, rawArg, explicitName, target, recursive);
    applyAdd(ctx, config, plan, name, explicitName, target, recursive);
    out.value = plan.outcome;
  }, ctx.home);
  return renderTapAdd(out.value, name, target, false, ctx.style);
}

/** Decide the outcome from config alone; throws the same-name usage error. */
function planAdd(
  config: Config,
  name: string,
  rawArg: string,
  explicitName: string | undefined,
  target: TapAddTarget,
  recursive: boolean,
): TapAddPlan {
  const sameTarget = config.taps.find((t) => sameTap(t, target));
  if (sameTarget) {
    if (sameTarget.registered && (explicitName === undefined || explicitName === sameTarget.name)) {
      const upgrade = recursive && sameTarget.discovery !== "recursive";
      return { outcome: upgrade ? "updated" : "no-op", sameTarget };
    }
    return { outcome: "promoted", sameTarget };
  }
  const sameName = config.taps.find((t) => t.name === name);
  if (sameName) {
    throw new CrewError(
      "usage_error",
      `tap \`${name}\` is already configured at \`${displayTarget(sameName)}\` — to add this one under a different name, run \`crew tap add ${rawArg} <tap-name>\``,
      { name, existing: displayTarget(sameName), incoming: displayTarget(target) },
    );
  }
  if (target.kind === "path" && !isDirectory(target.path))
    throw new CrewError(
      "usage_error",
      `\`${target.path}\` isn't a directory — \`crew tap add\` needs an existing local path`,
      { path: target.path },
    );
  return { outcome: "added", sameTarget: undefined };
}

/** The write-under-lock flow for a planned outcome. */
function applyAdd(
  ctx: CommandContext,
  config: Config,
  plan: TapAddPlan,
  name: string,
  explicitName: string | undefined,
  target: TapAddTarget,
  recursive: boolean,
): void {
  if (plan.outcome === "no-op") return;
  if (plan.outcome === "updated") {
    // `sameTarget` is always set for the updated/promoted outcomes.
    const existing = plan.sameTarget!;
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
      plan.sameTarget!,
      target.kind,
      explicitName,
      recursive,
    );
    return;
  }
  if (target.kind === "git") cloneNewTap(name, target.url, ctx.home);
  writeConfig({ ...config, taps: [...config.taps, newTapOf(name, target, recursive)] }, ctx.home);
}

function deriveName(target: TapAddTarget): string {
  if (target.kind === "git") return deriveAutoTapName(target.url, target.subpath);
  return target.path.split("/").filter(Boolean).pop() ?? "local";
}

/** Clone a new git tap; a failed clone leaves no partial directory (§16.3). */
function cloneNewTap(name: string, url: string, home: string): void {
  const cloneDir = tapPath(name, home);
  try {
    ensureClone(url, cloneDir);
  } catch (err) {
    if (exists(cloneDir)) rmrf(cloneDir);
    throw err;
  }
}

function newTapOf(name: string, target: TapAddTarget, recursive: boolean): TapConfig {
  return {
    name,
    kind: target.kind,
    registered: true,
    url: target.url,
    subpath: target.subpath,
    path: target.path,
    ...(recursive ? { discovery: "recursive" } : {}),
  };
}
