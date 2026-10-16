/**
 * Shared helpers for the `crew update` skill-path tests (§10.1).
 */

import { runCli } from "../../../src/cli/main.ts";
import { captureStreams } from "../../helpers/env.ts";

/** Run the CLI against `home`; its exit code and stdout. */
export function run(home: string, args: string[]): { code: number; stdout: string } {
  const cap = captureStreams();
  const code = runCli(args, { home, streams: cap.streams });
  return { code, stdout: cap.stdout() };
}
