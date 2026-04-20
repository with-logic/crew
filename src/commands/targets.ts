/**
 * `crew targets [enable|disable <name>]` (§7.2).
 *
 * With no arguments, shows every agent coder crew knows about with
 * human status descriptors (detected, forced on, disabled, not
 * found). The enable/disable subcommands toggle config flags.
 */

import { readConfig, writeConfig } from "../config/load.ts";
import { CrewError } from "../core/errors.ts";
import { withStateLock } from "../state/lock.ts";
import { ALL_ADAPTERS, adapterByName } from "../targets/registry.ts";
import { columns } from "../util/format.ts";
import type { Styler } from "../util/term.ts";
import type { CommandContext, CommandOutput } from "./types.ts";

export function targetsCommand(ctx: CommandContext): CommandOutput {
  const sub = ctx.positional[0];
  if (!sub) return list(ctx);
  if (sub === "enable") return toggle(ctx, ctx.positional.slice(1), "enable");
  if (sub === "disable") return toggle(ctx, ctx.positional.slice(1), "disable");
  // Unknown subcommand — a typo, most likely. Error with a hint.
  throw new CrewError(
    "usage_error",
    `\`crew targets\` has no subcommand named \`${sub}\` — run \`crew help targets\` to see what's available`,
    { sub },
  );
}

interface TargetRow {
  readonly name: string;
  readonly detected: boolean;
  readonly forced: boolean;
  readonly disabled: boolean;
}

function list(ctx: CommandContext): CommandOutput {
  const config = readConfig(ctx.home);
  const rows: TargetRow[] = ALL_ADAPTERS.map((a) => ({
    name: a.name,
    detected: a.detect(),
    forced: config.forced_targets.includes(a.name),
    disabled: config.disabled_targets.includes(a.name),
  }));
  return { exitCode: 0, human: renderList(rows, ctx.style), json: { targets: rows } };
}

function renderList(rows: readonly TargetRow[], style: Styler): string[] {
  const lines: string[] = [];
  lines.push(style.bold("Agent coders"));
  lines.push("");
  const cells: string[][] = rows.map((r) => [
    `  ${symbolFor(r, style)}`,
    style.bold(r.name),
    statusFor(r, style),
  ]);
  for (const line of columns(cells, 2)) lines.push(line);
  lines.push("");
  const anyMissing = rows.some((r) => !(r.detected || r.forced));
  if (anyMissing) {
    lines.push(style.dim("Run `crew targets enable <name>` to force one on anyway."));
  } else {
    lines.push(style.dim("Run `crew targets disable <name>` to skip one, or re-enable later."));
  }
  return lines;
}

function symbolFor(row: TargetRow, style: Styler): string {
  if (row.disabled) return style.symbol("muted");
  if (row.detected || row.forced) return style.symbol("ok");
  return style.symbol("muted");
}

function statusFor(row: TargetRow, style: Styler): string {
  if (row.disabled) return style.yellow("disabled");
  if (row.forced && !row.detected) return style.green("forced on");
  if (row.forced) return style.green("forced on (detected)");
  if (row.detected) return style.green("detected");
  return style.dim("not found");
}

function toggle(
  ctx: CommandContext,
  args: readonly string[],
  mode: "enable" | "disable",
): CommandOutput {
  if (args.length !== 1)
    throw new CrewError(
      "usage_error",
      `\`crew targets ${mode}\` needs exactly one target name — see \`crew targets\` for the list`,
    );
  const name = args[0]!;
  if (!adapterByName(name)) {
    const known = ALL_ADAPTERS.map((a) => a.name).join(", ");
    throw new CrewError("usage_error", `unknown target \`${name}\` — known targets: ${known}`, {
      name,
    });
  }
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
  const verb = mode === "enable" ? "Enabled" : "Disabled";
  const detail =
    mode === "enable" ? "crew will install into it from now on" : "crew will skip it from now on";
  return {
    exitCode: 0,
    human: [
      `${ctx.style.symbol("ok")} ${verb} ${ctx.style.bold(name)}`,
      ctx.style.dim(`  ${detail}`),
    ],
    json: { name, mode },
  };
}
