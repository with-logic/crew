/**
 * `crew install <ref> [<ref>...]` (§5.1).
 *
 * Thin command wrapper: reads config, runs the flow, formats the summary
 * for human or JSON output, and picks the right exit code per §9/§18.6.
 */

import { CrewError } from "../core/errors.ts";
import { readConfig } from "../config/load.ts";
import { runInstall } from "../install/flow.ts";
import type { CommandContext, CommandOutput } from "./types.ts";

export function installCommand(ctx: CommandContext): CommandOutput {
  if (ctx.positional.length === 0) {
    throw new CrewError("usage_error", "usage: crew install <ref> [<ref>...]");
  }
  const config = readConfig(ctx.home);
  const result = runInstall(config, {
    refs: ctx.positional,
    scope: ctx.flags.scope,
    force: ctx.flags.force,
    dryRun: ctx.flags.dryRun,
    restrictTargets: ctx.flags.target,
    cwd: ctx.cwd,
    home: ctx.home,
  });

  // Exit-code rules (§18.6 clarification): exit 1 if any root skill has
  // zero successful targets; otherwise 0. If nothing attempted (all were
  // already installed), §15 says exit 2 if the user explicitly asked —
  // but the clean "already installed" short-circuit case is exit 0 per
  // §5.4. We follow §5.4 for already-installed and §18.6 for failures.
  const allAlreadyInstalled = result.alreadyInstalled.length > 0 && result.summary.records.length === 0;
  let exitCode = 0;
  if (!allAlreadyInstalled) {
    const anyRootFail = result.summary.records.some((r) => !r.anySuccess);
    if (anyRootFail) exitCode = 1;
  }

  const human: string[] = [];
  for (const name of result.alreadyInstalled) {
    human.push(`${name}: already installed`);
  }
  for (const rec of result.summary.records) {
    const parts: string[] = [];
    for (const t of rec.targets) {
      if (t.kind === "installed") parts.push(`${t.target}=installed`);
      else if (t.kind === "up_to_date") parts.push(`${t.target}=up-to-date`);
      else parts.push(`${t.target}=failed(${t.error.code})`);
    }
    human.push(`${rec.name} [${rec.scope}]: ${parts.join(", ")}`);
  }

  return {
    exitCode,
    human,
    json: {
      already_installed: result.alreadyInstalled,
      records: result.summary.records,
      dry_run: ctx.flags.dryRun,
    },
  };
}
