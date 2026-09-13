/**
 * Shared types for command handlers.
 *
 * Every command is a function that takes a `CommandContext` and returns
 * a `CommandOutput`. The CLI layer interprets the output (formats to
 * human or JSON, sets exit code, writes to stdout/stderr).
 */

import type { ChoicePromptFn, PromptFn } from "../cli/prompt.ts";
import type { Scope } from "../core/types.ts";
import type { Styler } from "../util/term.ts";

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
  /**
   * Styler for human output: wraps strings in ANSI codes when the
   * output stream is a TTY and `NO_COLOR` isn't set, otherwise returns
   * strings unchanged. Tests default to the plain styler.
   */
  readonly style: Styler;
  /** Terminal width for human output wrapping/truncation. */
  readonly width: number;
  /**
   * Interactive confirm prompt (binary Y/n). Default implementation
   * reads stdin; tests inject a stub that returns a fixed answer.
   * Commands that never prompt can ignore this field.
   */
  readonly prompt: PromptFn;
  /**
   * Interactive numbered-menu prompt (1..N). Used when the choice
   * can't be expressed as a binary Y/n — e.g. picking among three or
   * more skills that share a bare name. Tests inject a stub that
   * returns a fixed index.
   */
  readonly promptChoice: ChoicePromptFn;
}

/** Global flags as parsed by the CLI. */
export interface CommandFlags {
  readonly scope: Scope;
  /**
   * True when the user passed `--scope` explicitly, as distinct from
   * `scope` falling back to its `user` default.
   *
   * `crew uninstall` cannot use this — it always targets exactly one
   * scope, defaulting to `user` (§7.4). The distinction matters only
   * where `--scope` is a FILTER rather than a target: `crew list` shows
   * both scopes when the flag is absent and narrows when it is present,
   * which no other signal can express, since `scope` alone reads as
   * `user` in both cases. It is parsed here because flag parsing is
   * central; `src/commands/list/index.ts` is the consumer.
   */
  readonly scopeGiven: boolean;
  readonly agent: readonly string[];
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
