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

import { lstatSync } from "node:fs";
import { join, relative, sep } from "node:path";
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
  // Every candidate is checked before any project is installed.
  const nested = nestedManifestDirs(root).filter((dir) => isOwnProject(root, dir));
  if (nested.length === 0) return installOne(ctx);
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
 * Whether the candidate `dir`, beneath `root`, is a project of this
 * repository in its own right.
 *
 * False when it is simply gone: git also lists a tracked manifest that has
 * been deleted from the work tree. Raises `manifest_invalid` when something
 * is there that must not be applied: a directory on the way that is a
 * symbolic link, which may lead out of the repository, or a `.crewrc` that
 * is not a regular file, which the single-project install would pass over
 * in favor of a manifest further up.
 *
 * Each directory from `root` down is examined without following links, so
 * a link is seen as a link whatever it points at, or at nothing.
 */
function isOwnProject(root: string, dir: string): boolean {
  const file = join(dir, MANIFEST_FILENAME);
  let at = root;
  for (const segment of relative(root, dir).split(sep)) {
    at = join(at, segment);
    const stat = lstatSync(at, { throwIfNoEntry: false });
    if (stat === undefined) return false;
    if (stat.isSymbolicLink()) {
      throw new CrewError(
        "manifest_invalid",
        `${file}: ${at} is a symbolic link, so this manifest is not applied as part of the repository`,
        { file },
      );
    }
  }
  const found = readFileAt(file);
  if (found.kind === "other") {
    throw new CrewError("manifest_invalid", `${file} is not a regular file`, { file });
  }
  return found.kind === "file";
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
