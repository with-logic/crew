/**
 * `crew agents [enable|disable <name>]` (§7.2).
 *
 * With no arguments, shows every agent crew knows about with human
 * status descriptors (detected, forced on, disabled, not found). The
 * enable/disable subcommands toggle config flags.
 */

import { AGENT_SKILLS_NAME, isFallbackDetected } from "../agents/fallback.ts";
import { ALL_AGENTS, agentByName } from "../agents/registry.ts";
import { readConfig, writeConfig } from "../config/load.ts";
import { CrewError } from "../core/errors.ts";
import { withStateLock } from "../state/lock.ts";
import { columns } from "../util/format.ts";
import type { Styler } from "../util/term.ts";
import type { CommandContext, CommandOutput } from "./types.ts";

export function agentsCommand(ctx: CommandContext): CommandOutput {
  const sub = ctx.positional[0];
  if (!sub) return list(ctx);
  if (sub === "enable") return toggle(ctx, ctx.positional.slice(1), "enable");
  if (sub === "disable") return toggle(ctx, ctx.positional.slice(1), "disable");
  // Unknown subcommand — a typo, most likely. Error with a hint.
  throw new CrewError(
    "usage_error",
    `\`crew agents\` has no subcommand named \`${sub}\` — run \`crew help agents\` to see what's available`,
    { sub },
  );
}

interface AgentRow {
  readonly name: string;
  readonly detected: boolean;
  readonly forced: boolean;
  readonly disabled: boolean;
}

function list(ctx: CommandContext): CommandOutput {
  const config = readConfig(ctx.home);
  const rows: AgentRow[] = ALL_AGENTS.map((a) => ({
    name: a.name,
    // §7.2 fallback — agent-skills is detected iff nobody else is.
    detected: a.name === AGENT_SKILLS_NAME ? isFallbackDetected(ALL_AGENTS) : a.detect(),
    forced: config.forced_agents.includes(a.name),
    disabled: config.disabled_agents.includes(a.name),
  }));
  return { exitCode: 0, human: renderList(rows, ctx.style), json: { agents: rows } };
}

function renderList(rows: readonly AgentRow[], style: Styler): string[] {
  const lines: string[] = [];
  lines.push(style.bold("Agents"));
  lines.push("");
  const cells: string[][] = rows.map((r) => [
    `  ${symbolFor(r, style)}`,
    style.bold(r.name),
    statusFor(r, style),
  ]);
  for (const line of columns(cells, 2)) lines.push(line);
  lines.push("");
  // With 17+ agents registered, at least one is always "not found"
  // on a normal machine. A single hint covers both cases — enable to
  // force one on, disable to skip.
  lines.push(
    style.dim("Run `crew agents enable <name>` or `crew agents disable <name>` to adjust."),
  );
  return lines;
}

function symbolFor(row: AgentRow, style: Styler): string {
  if (row.disabled) return style.symbol("muted");
  if (row.detected || row.forced) return style.symbol("ok");
  return style.symbol("muted");
}

function statusFor(row: AgentRow, style: Styler): string {
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
      `\`crew agents ${mode}\` needs exactly one agent name — see \`crew agents\` for the list`,
    );
  const name = args[0]!;
  if (!agentByName(name)) {
    const known = ALL_AGENTS.map((a) => a.name).join(", ");
    throw new CrewError("usage_error", `unknown agent \`${name}\` — known agents: ${known}`, {
      name,
    });
  }
  withStateLock(() => {
    const config = readConfig(ctx.home);
    const forced = new Set(config.forced_agents);
    const disabled = new Set(config.disabled_agents);
    if (mode === "enable") {
      forced.add(name);
      disabled.delete(name);
    } else {
      disabled.add(name);
      forced.delete(name);
    }
    writeConfig(
      { ...config, forced_agents: [...forced].sort(), disabled_agents: [...disabled].sort() },
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
