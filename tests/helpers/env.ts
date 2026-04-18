/**
 * Redirect crew's HOME and set a stable time, and return helpers to pass
 * to `runCli` so tests never need to touch process.env or the real home
 * directory.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OutputStreams } from "../../src/cli/output.ts";

/** Capture stdout/stderr into a buffer. */
export function captureStreams(): { streams: OutputStreams; stdout(): string; stderr(): string } {
  let stdout = "";
  let stderr = "";
  return {
    streams: {
      stdout: (s: string) => {
        stdout += s;
      },
      stderr: (s: string) => {
        stderr += s;
      },
    },
    stdout: () => stdout,
    stderr: () => stderr,
  };
}

/** Make a fresh crew home directory. */
export function makeCrewHome(): string {
  return mkdtempSync(join(tmpdir(), "crew-home-"));
}
