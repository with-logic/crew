/**
 * CLI entry point.
 *
 * `runCli` takes raw argv (excluding `node` and program name) and returns
 * the exit code. Wrapping the flow in a pure function makes it trivially
 * testable without spawning subprocesses.
 */

import type { CommandContext } from "../commands/types.ts";
import { CrewError } from "../core/errors.ts";
import { crewHome } from "../core/paths.ts";
import { parseArgs } from "./args.ts";
import { dispatch } from "./dispatch.ts";
import { defaultStreams, type OutputStreams, writeError, writeSuccess } from "./output.ts";

/** Options for `runCli` (useful to tests). */
export interface RunCliOptions {
  readonly cwd?: string;
  readonly home?: string;
  readonly streams?: OutputStreams;
}

/** Run the CLI with the given argv. Returns an exit code. */
export function runCli(argv: readonly string[], options: RunCliOptions = {}): number {
  const streams = options.streams ?? defaultStreams;
  const cwd = options.cwd ?? process.cwd();
  const home = options.home ?? crewHome();

  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    // `parseArgs` only raises `CrewError`.
    const ce = err as CrewError;
    writeError(ce, false, streams);
    return ce.exitCode;
  }

  const ctx: CommandContext = {
    positional: parsed.positional,
    flags: parsed.flags,
    cwd,
    home,
  };

  try {
    const output = dispatch(parsed.command, ctx);
    writeSuccess(output, parsed.flags.json, parsed.flags.quiet, streams);
    return output.exitCode;
  } catch (err) {
    if (err instanceof CrewError) {
      writeError(err, parsed.flags.json, streams);
      return err.exitCode;
    }
    // Unexpected runtime error — wrap it in a usage error so the user
    // gets a formatted message and exit 4, rather than a raw stack trace.
    const message = (err as Error).message ?? String(err);
    writeError(
      new CrewError("usage_error", `unexpected error: ${message}`),
      parsed.flags.json,
      streams,
    );
    return 4;
  }
}
