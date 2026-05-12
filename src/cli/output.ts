/**
 * Output formatting for commands.
 *
 * Handles the split between human-readable stdout and JSON-mode stdout,
 * and maps `CrewError` into a structured JSON error payload when the
 * caller requested `--json` output.
 *
 * Error rendering in human mode is deliberately more than a prefixed
 * one-liner. Every error code carries a short remedy hint — one
 * sentence that tells the user the next thing they can try. The goal
 * is that hitting an error feels like a peer pointing you at the fix,
 * not like a stack trace.
 */

import type { CommandOutput } from "../commands/types.ts";
import type { CrewError, CrewErrorName } from "../core/errors.ts";
import type { Styler } from "../util/term.ts";

/** Writable stream shape used by `writeOutput` — lets tests pass buffers. */
export interface OutputStreams {
  readonly stdout: (s: string) => void;
  readonly stderr: (s: string) => void;
}

/** Default streams: write directly to process.stdout/stderr. */
export const defaultStreams: OutputStreams = {
  stdout: (s) => {
    process.stdout.write(s);
  },
  stderr: (s) => {
    process.stderr.write(s);
  },
};

/** Write a successful command output. */
export function writeSuccess(
  output: CommandOutput,
  json: boolean,
  quiet: boolean,
  streams: OutputStreams,
): void {
  if (json) {
    streams.stdout(`${JSON.stringify(output.json ?? {}, null, 2)}\n`);
    return;
  }
  if (!quiet) {
    for (const line of output.human ?? []) {
      streams.stdout(`${line}\n`);
    }
  }
  for (const line of output.stderr ?? []) {
    streams.stderr(`${line}\n`);
  }
}

/** Format a CrewError according to the output mode. */
export function writeError(
  err: CrewError,
  json: boolean,
  streams: OutputStreams,
  style: Styler,
): void {
  if (json) {
    streams.stdout(
      `${JSON.stringify(
        {
          error: {
            name: err.code,
            message: err.message,
            details: err.details ?? {},
          },
        },
        null,
        2,
      )}\n`,
    );
    return;
  }
  streams.stderr(`${style.red(style.bold("Error"))} ${style.dim(`(${err.code})`)}\n`);
  writeMessageBlock(err.message, streams);
  const hint = err.remedy === undefined ? REMEDIES[err.code] : err.remedy;
  if (hint) {
    streams.stderr(`\n${style.bold("Next step")}\n`);
    writeMessageBlock(hint, streams);
  }
}

function writeMessageBlock(message: string, streams: OutputStreams): void {
  for (const line of message.split("\n")) {
    streams.stderr(line.length === 0 ? "\n" : `  ${line}\n`);
  }
}

/**
 * One-line remedy hint per error code. Keep them concrete, action-oriented,
 * and spoken in a peer-to-peer voice — "try X" over "you must X".
 * These ride along with the error message to point users at the next step.
 */
const REMEDIES: Partial<Record<CrewErrorName, string>> = {
  invalid_ref:
    "Refs can look like `skill-name`, `./path`, `gh:owner/repo`, or `@owner/repo`. Run `crew help install` for examples.",
  invalid_skill:
    "Check the skill's SKILL.md frontmatter against the Agent Skills spec: https://agentskills.io/specification.",
  no_skills_found:
    "If this is a directory, make sure it contains a SKILL.md or has subdirectories that do.",
  source_unreachable:
    "Homecrew couldn't reach the source. Check the URL, your network, and that you have access to the repo.",
  source_gone:
    "The source resolved, but the skill is no longer in it. Your local copy is kept; run `crew uninstall <name>` if you want it gone.",
  ref_not_found:
    "That tag, branch, or SHA doesn't exist upstream. Run `git ls-remote <url>` to see what's there.",
  ambiguous_reference:
    "Qualify the name with its tap, for example `core/<name>`, so Homecrew knows which one to use.",
  ambiguous_dependency:
    "A dependency is ambiguous across taps. Qualify it in the parent skill's `metadata.crew.dependencies`, for example `core/<name>`.",
  conflicting_dependencies:
    "Two skills in the install set share a name but resolve to different SHAs. Pin one to the version you want, or install them separately.",
  name_conflict:
    "A skill with this name is already installed from a different source. Uninstall it first with `crew uninstall <name>`, then reinstall from the new source. `--force` does not override this.",
  untracked_directory:
    "Something else created this directory, not Homecrew. Move or delete it, or pass `--force` to overwrite.",
  customized:
    "You've edited this skill since install. To replace your edits with the fresh version, rerun with `--force`.",
  inconsistent_marker:
    "The destination's .crew.json doesn't match the skill being installed. Investigate before forcing; `--force` will overwrite.",
  not_installed_here:
    "Nothing was removed at this scope. Check `crew list`; add `--force` to treat this as a no-op.",
  no_agents:
    "No agent coders are active. Run `crew agents` to see detection status, or `crew agents enable <name>` to force one on.",
  config_invalid:
    "Homecrew couldn't parse `~/.crew/config.yaml`. Fix the YAML or delete the file to get defaults back.",
  state_locked:
    "Another `crew` process is holding the lock. Wait a few seconds and try again; if it's really stuck, run `crew doctor --repair`.",
  launchd_failure:
    "`launchctl` couldn't load or unload the autoupdate agent. `crew autoupdate status` shows details; `crew autoupdate disable` then `crew autoupdate enable` is a safe reset.",
  self_update_unavailable:
    "Homecrew couldn't reach the release feed, or the requested version doesn't exist. Check your network, then try `crew self-update --check`.",
  self_update_failed:
    "Homecrew downloaded the new binary but couldn't swap it in. Usually the install directory isn't writable. Re-run from a shell that can write to that directory, or reinstall via the installer script.",
  usage_error: "Run `crew help` for an overview, or `crew help <command>` for details.",
  unknown_skill:
    "This skill is not installed under any scope. Run `crew list` to see what Homecrew is tracking.",
};
