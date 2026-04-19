/**
 * `crew install <ref> [<ref>...]` (§5.1).
 *
 * Thin command wrapper: reads config, runs the flow, formats the summary
 * for human or JSON output, and picks the right exit code per §9/§18.6.
 */

import { readConfig } from "../config/load.ts";
import { CrewError } from "../core/errors.ts";
import { runInstall } from "../install/flow.ts";
import type { CommandContext, CommandOutput } from "./types.ts";

export function installCommand(ctx: CommandContext): CommandOutput {
  if (ctx.positional.length === 0) {
    throw new CrewError(
      "usage_error",
      "`crew install` needs at least one skill reference — e.g. `crew install python-testing`, `crew install @acme/skills`, or `crew install ./my-skill`",
    );
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
  const allAlreadyInstalled =
    result.alreadyInstalled.length > 0 && result.summary.records.length === 0;
  let exitCode = 0;
  if (!allAlreadyInstalled) {
    const anyRootFail = result.summary.records.some((r) => !r.anySuccess);
    if (anyRootFail) {
      exitCode = 1;
    }
  }

  const human: string[] = [];
  for (const existing of result.alreadyInstalled) {
    // Show the user what they already have: ref (if any) and short SHA
    // (if any). Makes "already installed" actually informative.
    const version = formatVersion(existing.ref, existing.resolvedSha);
    const targets = existing.targets.length > 0 ? ` in ${existing.targets.join(", ")}` : "";
    human.push(`${existing.name}: already installed${version ? ` (${version})` : ""}${targets}`);
  }
  for (const rec of result.summary.records) {
    const parts: string[] = [];
    for (const t of rec.targets) {
      if (t.kind === "installed") {
        parts.push(`${t.target}=installed`);
      } else if (t.kind === "up_to_date") {
        parts.push(`${t.target}=up-to-date`);
      } else {
        parts.push(`${t.target}=failed(${t.error.code})`);
      }
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

/**
 * Build a human-readable "version" tag for an already-installed skill:
 * the requested ref plus a short SHA when both exist, or just one of
 * them if that's all we have. Returns "" when neither is set (e.g.
 * pure path sources with no git identity).
 */
function formatVersion(ref: string | null, sha: string | null): string {
  const shortSha = sha ? sha.slice(0, 8) : null;
  if (ref && shortSha && ref !== sha) return `${ref} @ ${shortSha}`;
  if (shortSha) return shortSha;
  if (ref) return ref;
  return "";
}
