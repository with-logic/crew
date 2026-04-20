/**
 * Output formatting for commands.
 *
 * Handles the split between human-readable stdout and JSON-mode stdout,
 * and maps `CrewError` into a structured JSON error payload when the
 * caller requested `--json` output.
 *
 * Error rendering in human mode is deliberately more than
 * `error: <message>`. Every error code carries a short remedy hint —
 * one sentence that tells the user the next thing they can try. The
 * goal is that hitting an error feels like a peer pointing you at the
 * fix, not like a stack trace.
 */

import type { CommandOutput } from "../commands/types.ts";
import type { CrewError, CrewErrorName } from "../core/errors.ts";

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
export function writeError(err: CrewError, json: boolean, streams: OutputStreams): void {
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
  streams.stderr(`error: ${err.message}\n`);
  const hint = REMEDIES[err.code];
  if (hint) {
    streams.stderr(`  → ${hint}\n`);
  }
}

/**
 * One-line remedy hint per error code. Keep them concrete, action-oriented,
 * and spoken in a peer-to-peer voice — "try X" over "you must X".
 * These ride along with the error message to point users at the next step.
 */
const REMEDIES: Partial<Record<CrewErrorName, string>> = {
  invalid_ref:
    "refs look like `skill-name`, `./path`, `gh:owner/repo`, or `@owner/repo` — run `crew help install` for examples.",
  invalid_skill:
    "check the skill's SKILL.md frontmatter against the Agent Skills spec (https://agentskills.io/specification).",
  no_skills_found:
    "pointed at a directory? make sure it contains a SKILL.md, or has subdirectories that do.",
  source_unreachable:
    "crew couldn't reach the source. check the URL, your network, and that you have access to the repo.",
  source_gone:
    "the source resolved but the skill is no longer in it. your local copy is kept; run `crew uninstall <name>` if you want it gone.",
  ref_not_found:
    "that tag/branch/SHA doesn't exist upstream. run `git ls-remote <url>` to see what's there.",
  ambiguous_reference:
    "qualify the name with its tap (e.g. `core/<name>`) so crew knows which one to use.",
  ambiguous_dependency:
    "a dependency is ambiguous across taps. qualify it in the parent skill's `metadata.crew.dependencies` (e.g. `core/<name>`).",
  conflicting_dependencies:
    "two skills in the install set share a name but resolve to different SHAs. pin one to the version you want, or install them separately.",
  name_conflict:
    "a skill with this name is already installed from a different source. uninstall it first (`crew uninstall <name>`), then reinstall from the new source. `--force` does NOT override this.",
  untracked_directory:
    "something else created this directory (not crew). move or delete it, or pass `--force` to overwrite.",
  customized:
    "you've edited this skill since install. to replace your edits with the fresh version, rerun with `--force`.",
  inconsistent_marker:
    "the destination's .crew.json doesn't match the skill being installed. investigate before forcing; `--force` will overwrite.",
  not_installed_here:
    "nothing to remove at this scope. check `crew list`; add `--force` to treat this as a no-op.",
  no_agents:
    "no agent coders are active. run `crew agents` to see detection status, or `crew agents enable <name>` to force one on.",
  config_invalid:
    "crew couldn't parse `~/.crew/config.yaml`. fix the YAML or delete the file to get defaults back.",
  state_locked:
    "another `crew` process is holding the lock. wait a few seconds and try again; if it's really stuck, run `crew doctor --repair`.",
  launchd_failure:
    "launchctl couldn't load/unload the autoupdate agent. `crew autoupdate status` shows details; `crew autoupdate disable` then `enable` is a safe reset.",
  usage_error: "run `crew help` for an overview, or `crew help <command>` for details.",
  unknown_skill: "not installed under any scope. run `crew list` to see what crew is tracking.",
};
