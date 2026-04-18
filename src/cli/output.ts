/**
 * Output formatting for commands.
 *
 * Handles the split between human-readable stdout and JSON-mode stdout,
 * and maps `CrewError` into a structured JSON error payload when the
 * caller requested `--json` output.
 */

import type { CommandOutput } from "../commands/types.ts";
import type { CrewError } from "../core/errors.ts";

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
}
