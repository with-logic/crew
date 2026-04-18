/**
 * Shared types for command handlers.
 *
 * Every command is a function that takes a `CommandContext` and returns
 * a `CommandOutput`. The CLI layer interprets the output (formats to
 * human or JSON, sets exit code, writes to stdout/stderr).
 */

import type { Scope } from "../core/types.ts";

/** Parsed flags + positionals plus environment for the run. */
export interface CommandContext {
  /** Positional arguments after the subcommand. */
  readonly positional: readonly string[];
  /** Parsed global flags. */
  readonly flags: CommandFlags;
  /** Current working directory. */
  readonly cwd: string;
  /** Effective `~/.crew/` home. */
  readonly home: string;
}

/** Global flags as parsed by the CLI. */
export interface CommandFlags {
  readonly scope: Scope;
  readonly target: readonly string[];
  readonly dryRun: boolean;
  readonly json: boolean;
  readonly quiet: boolean;
  readonly verbose: boolean;
  readonly yes: boolean;
  readonly force: boolean;
  /** Command-specific extras, by flag name. */
  readonly extras: Readonly<Record<string, string | boolean>>;
}

/** What a command returns. */
export interface CommandOutput {
  /** Exit code (0 for success). */
  readonly exitCode: number;
  /** Lines to print on stdout in human mode. */
  readonly human?: readonly string[];
  /** Structured payload for JSON mode. */
  readonly json?: unknown;
  /** Optional stderr lines (e.g. warnings). */
  readonly stderr?: readonly string[];
}
