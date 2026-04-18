/**
 * `crew targets [enable|disable <name>]` (§7.2).
 *
 * With no arguments, lists every adapter with detection status and
 * whether it's force-enabled or disabled.
 */

import { CrewError } from "../core/errors.ts";
import { readConfig, writeConfig } from "../config/load.ts";
import { ALL_ADAPTERS, adapterByName } from "../targets/registry.ts";
import { withStateLock } from "../state/lock.ts";
import type { CommandContext, CommandOutput } from "./types.ts";

export function targetsCommand(ctx: CommandContext): CommandOutput {
  const sub = ctx.positional[0];
  if (!sub) return list(ctx);
  if (sub === "enable") return toggle(ctx, ctx.positional.slice(1), "enable");
  if (sub === "disable") return toggle(ctx, ctx.positional.slice(1), "disable");
  throw new CrewError("usage_error", "usage: crew targets [enable|disable <name>]");
}

function list(ctx: CommandContext): CommandOutput {
  const config = readConfig(ctx.home);
  const rows = ALL_ADAPTERS.map((a) => ({
    name: a.name,
    detected: a.detect(),
    forced: config.forced_targets.includes(a.name),
    disabled: config.disabled_targets.includes(a.name),
  }));
  const human = rows.map((r) => {
    const flags: string[] = [];
    if (r.detected) flags.push("detected");
    if (r.forced) flags.push("forced");
    if (r.disabled) flags.push("disabled");
    if (flags.length === 0) flags.push("not-installed");
    return `${r.name.padEnd(16)} [${flags.join(", ")}]`;
  });
  return { exitCode: 0, human, json: { targets: rows } };
}

function toggle(ctx: CommandContext, args: readonly string[], mode: "enable" | "disable"): CommandOutput {
  if (args.length !== 1) throw new CrewError("usage_error", `usage: crew targets ${mode} <name>`);
  const name = args[0]!;
  if (!adapterByName(name)) throw new CrewError("usage_error", `unknown target: ${name}`);
  withStateLock(() => {
    const config = readConfig(ctx.home);
    const forced = new Set(config.forced_targets);
    const disabled = new Set(config.disabled_targets);
    if (mode === "enable") {
      forced.add(name);
      disabled.delete(name);
    } else {
      disabled.add(name);
      forced.delete(name);
    }
    writeConfig(
      { ...config, forced_targets: [...forced].sort(), disabled_targets: [...disabled].sort() },
      ctx.home,
    );
  }, ctx.home);
  return { exitCode: 0, human: [`${name} ${mode}d`], json: { name, mode } };
}
