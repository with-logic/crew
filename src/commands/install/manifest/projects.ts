/**
 * A bare `crew install` in a repository with several projects (§9.2): the
 * manifest governing the current directory is applied, and then every
 * manifest in a directory beneath it, each as its own project.
 *
 * This module lists the candidate directories, once, checks that each is a
 * real directory of this repository holding a regular `.crewrc`, and runs
 * the single-project install in each. That install loads the manifest of
 * the directory it is given and looks no further, so each project gets its
 * own install location, lockfile, and ownership, and is processed once.
 */

import { realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { CrewError } from "../../../core/errors.ts";
import {
  loadManifestFor,
  MANIFEST_FILENAME,
  nestedManifestDirs,
  readFileAt,
} from "../../../manifest/index.ts";
import { safePath } from "../../../util/redact.ts";
import type { CommandContext, CommandOutput } from "../../types.ts";
import { sharingRemoteLookups } from "./latest.ts";

/** One project's manifest and what installing it reported. */
interface ProjectOutput {
  readonly manifestFile: string;
  readonly output: CommandOutput;
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
  const root = governing?.projectRoot ?? ctx.cwd;
  const nested = nestedManifestDirs(root);
  if (nested.length === 0) return installOne(ctx);
  // Every candidate is checked before any project is installed.
  for (const dir of nested) requireOwnProject(root, dir);
  // The governing project first, then those beneath it in path order. An
  // error raised by one stops the run there; what earlier ones did stands.
  // Under `--latest`, projects that name the same source share one lookup of it.
  return sharingRemoteLookups(() => {
    const outputs: ProjectOutput[] = [];
    if (governing) outputs.push({ manifestFile: governing.file, output: installOne(ctx) });
    for (const dir of nested) {
      const manifestFile = join(dir, MANIFEST_FILENAME);
      outputs.push({ manifestFile, output: installOne({ ...ctx, cwd: dir }) });
    }
    return combine(outputs, governing !== null, ctx);
  });
}

/**
 * Refuse a candidate that is not a project of this repository in its own
 * right: a directory reached through a symbolic link, which may lie outside
 * the repository, or a `.crewrc` that is not a regular file, which the
 * single-project install would pass over in favor of a manifest further up.
 */
function requireOwnProject(root: string, dir: string): void {
  const file = join(dir, MANIFEST_FILENAME);
  const isPhysicallyBeneath = realpathSync(dir) === join(realpathSync(root), relative(root, dir));
  if (!isPhysicallyBeneath) {
    throw new CrewError(
      "manifest_invalid",
      `${file}: its directory is reached through a symbolic link, so it is not applied as part of this repository`,
      { file },
    );
  }
  if (readFileAt(file).kind !== "file") {
    throw new CrewError("manifest_invalid", `${file} is not a regular file`, { file });
  }
}

/** Join the outputs of several projects into one, in the order they ran. */
function combine(
  outputs: readonly ProjectOutput[],
  hasGoverning: boolean,
  ctx: CommandContext,
): CommandOutput {
  const human: string[] = [];
  const stderr: string[] = [];
  const results: unknown[] = [];
  let exitCode = 0;
  for (const { manifestFile, output } of outputs) {
    results.push(output.json);
    if (human.length > 0) human.push("");
    human.push(ctx.style.bold(safePath(manifestFile)), ...(output.human ?? []));
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
  const top = hasGoverning ? (results[0] as object) : nothingAtTop;
  const nested = hasGoverning ? results.slice(1) : results;
  return { exitCode, human, stderr, json: { ...top, nested } };
}
