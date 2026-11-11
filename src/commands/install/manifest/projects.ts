/**
 * A bare `crew install` in a repository with several projects (§9.2): the
 * manifest governing the current directory is applied, and then every
 * manifest in a directory beneath it, each as its own project.
 *
 * This module finds the manifests, once, and hands each to the
 * single-project install, which does no searching of its own. Each project
 * therefore gets its own install location, lockfile, and ownership, and is
 * processed exactly once.
 */

import { loadManifestFor, nestedManifestDirs } from "../../../manifest/index.ts";
import { safePath } from "../../../util/redact.ts";
import type { CommandContext, CommandOutput } from "../../types.ts";
import { sharingRemoteLookups } from "./latest.ts";

/**
 * The `--json` result of a bare install of one project. Every such result
 * names its manifest (§9.2); the rest is passed through untouched.
 */
interface ProjectResult {
  readonly manifest_path: string;
  readonly [field: string]: unknown;
}

/**
 * Run `installOne`, a bare install of the single project governing its
 * context's directory, for each project the command covers.
 *
 * With no manifest beneath the governing one this is `installOne(ctx)` and
 * nothing more, including its usage error when there is no manifest at all.
 */
export function installEveryProject(
  ctx: CommandContext,
  installOne: (project: CommandContext) => CommandOutput,
): CommandOutput {
  const governing = loadManifestFor(ctx.cwd);
  const nested = nestedManifestDirs(governing?.projectRoot ?? ctx.cwd);
  if (nested.length === 0) return installOne(ctx);
  // The governing project first, then those beneath it in path order. An
  // error raised by one stops the run there; what earlier ones did stands.
  // Under `--latest`, projects that name the same source share one lookup of it.
  return sharingRemoteLookups(() => {
    const outputs = governing ? [installOne(ctx)] : [];
    for (const dir of nested) outputs.push(installOne({ ...ctx, cwd: dir }));
    return combine(outputs, governing !== null, ctx);
  });
}

/** Join the outputs of several projects into one, in the order they ran. */
function combine(
  outputs: readonly CommandOutput[],
  hasGoverning: boolean,
  ctx: CommandContext,
): CommandOutput {
  const human: string[] = [];
  const stderr: string[] = [];
  const results: ProjectResult[] = [];
  let exitCode = 0;
  for (const output of outputs) {
    const result = output.json as ProjectResult;
    results.push(result);
    if (human.length > 0) human.push("");
    human.push(ctx.style.bold(safePath(result.manifest_path)), ...(output.human ?? []));
    stderr.push(...(output.stderr ?? []));
    // The first failure decides the exit code; later projects still ran.
    if (exitCode === 0) exitCode = output.exitCode;
  }
  // With no governing manifest, the top level is an empty result and every project is nested.
  const nothingAtTop = {
    already_installed: [],
    records: [],
    skipped: [],
    dry_run: ctx.flags.dryRun,
    removed: [],
  };
  const top = hasGoverning ? results[0] : nothingAtTop;
  const nested = hasGoverning ? results.slice(1) : results;
  return { exitCode, human, stderr, json: { ...top, nested } };
}
