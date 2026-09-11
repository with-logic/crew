/**
 * Top-level command aliases (§5.1).
 *
 * An alias maps a user-typed command word to a canonical command plus
 * an optional positional prefix (`taps` → `tap list`). The table lives
 * here, separate from the dispatcher, because the argv parser also
 * needs it: per-subcommand flag tables are keyed by the canonical
 * command, so `crew rm --prune foo` must resolve to `uninstall` before
 * flags are validated.
 */

/** Canonical command name plus positionals to prepend. */
export type CommandAlias = readonly [canonical: string, ...positionalPrefix: string[]];

export const COMMAND_ALIASES: Record<string, CommandAlias> = {
  skills: ["list"],
  ls: ["list"],
  remove: ["uninstall"],
  rm: ["uninstall"],
  upgrade: ["update"],
  taps: ["tap", "list"],
  untap: ["tap", "remove"],
};

/** The canonical command word for `command`, or `command` itself when it isn't an alias. */
export function canonicalCommand(command: string): string {
  return COMMAND_ALIASES[command]?.[0] ?? command;
}
