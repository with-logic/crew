/**
 * A bare `crew install` in a repository with several projects (§9.2): the
 * manifest governing the current directory is applied, and then every
 * manifest in a directory beneath it, each as its own project.
 *
 * This module gets the verified project directories, once
 * (`nestedProjectDirs`), and runs the single-project install in each. That
 * install loads the manifest of the directory it is given and looks no
 * further, so each project gets its own install location, lockfile, and
 * ownership, and is processed once.
 */

import { join } from "node:path";
import { CrewError } from "../../../core/errors.ts";
import {
  isOwnProject,
  loadManifestFor,
  MANIFEST_FILENAME,
  nestedProjectDirs,
} from "../../../manifest/index.ts";
import { safePath } from "../../../util/redact.ts";
import type { CommandContext, CommandOutput } from "../../types.ts";
import { withSharedRemoteLookups } from "./latest.ts";

/**
 * A bare install of the single project governing its context's directory.
 * Given `expectedManifestFile`, it must find exactly that manifest, or fail.
 */
type InstallOne = (project: CommandContext, expectedManifestFile?: string) => CommandOutput;

/** One project's manifest and what installing it reported. */
interface ProjectOutput {
  readonly manifestFile: string;
  readonly output: CommandOutput;
}

/**
 * Run `installOne`, a bare install of the single project governing its
 * context's directory, for each project the command covers.
 *
 * With no manifest beneath the governing one this is one `installOne` and
 * nothing more, including its usage error when there is no manifest at all.
 * The governing manifest is found once, here: its install is told to find
 * that same file, so it cannot settle for one further up if this one goes
 * away while the projects beneath it are being listed.
 */
export function installEveryProject(ctx: CommandContext, installOne: InstallOne): CommandOutput {
  const governing = loadManifestFor(ctx.cwd);
  const root = governing?.projectRoot ?? ctx.cwd;
  // Every candidate is checked before any project is installed.
  const nested = nestedProjectDirs(root);
  if (nested.length === 0) return installOne(ctx, governing?.file);
  // The governing project first, then those beneath it in path order. An
  // error raised by one stops the run there; what earlier ones did stands.
  // Under `--latest`, projects that name the same source share one lookup of it.
  return withSharedRemoteLookups(() => {
    const outputs: ProjectOutput[] = [];
    if (governing) {
      outputs.push({ manifestFile: governing.file, output: installOne(ctx, governing.file) });
    }
    for (const dir of nested) outputs.push(installNestedProject({ root, dir, ctx, installOne }));
    return combine(outputs, governing !== null, ctx);
  });
}

/**
 * Install the nested project at `dir`. It was checked when the run started;
 * it is checked again here, immediately before use, because earlier projects
 * have been installed since and the work tree is not under any lock. The
 * install is then told which manifest it must find, so it cannot settle for
 * another one.
 */
function installNestedProject(at: {
  readonly root: string;
  readonly dir: string;
  readonly ctx: CommandContext;
  readonly installOne: InstallOne;
}): ProjectOutput {
  const { root, dir, ctx, installOne } = at;
  const manifestFile = join(dir, MANIFEST_FILENAME);
  if (!isOwnProject({ root, dir })) {
    throw new CrewError(
      "manifest_invalid",
      `${manifestFile} stopped being a project of this repository while crew was installing the projects before it`,
      { file: manifestFile },
    );
  }
  return { manifestFile, output: installOne({ ...ctx, cwd: dir }, manifestFile) };
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
