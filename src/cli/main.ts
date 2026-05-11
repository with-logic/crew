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
import { maybeEmitUpdateNotice } from "../self-update/notice.ts";
import { colorEnabled, makeStyler, type Styler, terminalWidth } from "../util/term.ts";
import { parseArgs } from "./args.ts";
import { dispatch } from "./dispatch.ts";
import { defaultStreams, type OutputStreams, writeError, writeSuccess } from "./output.ts";
import {
  type ChoicePromptFn,
  defaultChoicePrompt,
  defaultPrompt,
  type PromptFn,
} from "./prompt.ts";

/** Options for `runCli` (useful to tests). */
export interface RunCliOptions {
  readonly cwd?: string;
  readonly home?: string;
  readonly streams?: OutputStreams;
  /** Override the styler (tests use the plain one; default detects TTY). */
  readonly style?: Styler;
  /** Override terminal width (default reads process.stdout.columns). */
  readonly width?: number;
  /** Override the interactive prompt (default reads stdin / returns abort on non-TTY). */
  readonly prompt?: PromptFn;
  /** Override the numbered-menu prompt (default reads stdin / returns abort on non-TTY). */
  readonly promptChoice?: ChoicePromptFn;
  /**
   * Override whether stderr is treated as a TTY for the post-command
   * update notice (§10.4). Default reads `process.stderr.isTTY`. Tests
   * set this to `true` when they want to see the notice, `false` to
   * suppress it. When a `streams` override is in play and the caller
   * doesn't set this, we default to `false` — captured streams are
   * almost never actual terminals.
   */
  readonly stderrIsTty?: boolean;
}

/** Run the CLI with the given argv. Returns an exit code. */
export function runCli(argv: readonly string[], options: RunCliOptions = {}): number {
  const streams = options.streams ?? defaultStreams;
  const cwd = options.cwd ?? process.cwd();
  const home = options.home ?? crewHome();
  // When the caller supplied a streams override (tests, pipes), force
  // plain-text output regardless of whether the real stdout is a TTY —
  // color codes in captured buffers are almost never what you want.
  const style = options.style ?? makeStyler(options.streams === undefined && colorEnabled());
  const width = options.width ?? terminalWidth();
  const prompt = options.prompt ?? defaultPrompt;
  const promptChoice = options.promptChoice ?? defaultChoicePrompt;
  const stderrIsTty =
    options.stderrIsTty ?? (options.streams === undefined ? Boolean(process.stderr.isTTY) : false);

  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    // `parseArgs` only raises `CrewError`.
    const ce = err as CrewError;
    writeError(ce, false, streams, style);
    return ce.exitCode;
  }

  const ctx: CommandContext = {
    positional: parsed.positional,
    flags: parsed.flags,
    cwd,
    home,
    style,
    width,
    prompt,
    promptChoice,
  };

  let exitCode: number;
  try {
    const output = dispatch(parsed.command, ctx);
    writeSuccess(output, parsed.flags.json, parsed.flags.quiet, streams);
    exitCode = output.exitCode;
  } catch (err) {
    if (err instanceof CrewError) {
      writeError(err, parsed.flags.json, streams, style);
      exitCode = err.exitCode;
    } else {
      // Unexpected runtime error — wrap it in a usage error so the user
      // gets a formatted message and exit 4, rather than a raw stack trace.
      const message = (err as Error).message ?? String(err);
      writeError(
        new CrewError(
          "usage_error",
          `crew hit an unexpected error: ${message} — please report this at https://github.com/logic-app/crew/issues with steps to reproduce`,
        ),
        parsed.flags.json,
        streams,
        style,
      );
      exitCode = 4;
    }
  }

  // §10.4 update-available notice. Runs on every command path (success
  // or failure) so users see it regardless of what they just tried.
  // The function has its own suppression rules — we call it
  // unconditionally and let it decide.
  maybeEmitUpdateNotice({
    command: parsed.command,
    home,
    json: parsed.flags.json,
    quiet: parsed.flags.quiet,
    streams,
    stderrIsTty,
  });

  return exitCode;
}
