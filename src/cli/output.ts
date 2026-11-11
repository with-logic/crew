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
import type { CrewError } from "../core/errors.ts";
import { displayDetails, displayText } from "../refs/display-url.ts";
import { sanitizeLine } from "../util/redact.ts";
import type { Styler } from "../util/term.ts";
import { REMEDIES } from "./remedies/index.ts";

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
    // `details` is a stable machine contract (§13), so keys are kept —
    // but a value can be a credential-bearing URL, and the JSON payload
    // is exactly what gets pasted into a CI log or an issue.
    streams.stdout(
      `${JSON.stringify(
        {
          error: {
            name: err.code,
            message: displayText(err.message),
            details: displayDetails(err.details ?? {}),
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

/**
 * The single sink every human-readable error message and remedy hint passes
 * through, so redaction here covers present and future errors rather than
 * relying on each construction site to remember.
 *
 * A message is prose that may have a URL interpolated into it (see
 * `acquireTap`'s `no_skills_found`, which embeds `tap.url`), and that URL can
 * carry userinfo or a credential-bearing query parameter. `displayText` scans
 * for URL-shaped substrings, which a whole-string URL parse cannot do.
 */
function writeMessageBlock(message: string, streams: OutputStreams): void {
  for (const line of displayText(message).split("\n")) {
    const safe = sanitizeLine(line);
    streams.stderr(safe.length === 0 ? "\n" : `  ${safe}\n`);
  }
}
