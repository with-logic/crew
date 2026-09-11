/**
 * Top-level command aliases (§5.1).
 *
 * An alias maps a user-typed command word to a canonical command plus
 * an optional positional prefix (`taps` → `tap list`). The table lives
 * here, separate from the dispatcher, because the argv parser also
 * needs it: per-subcommand flag tables are keyed by the canonical
 * command, so `crew rm --prune foo` must resolve to `uninstall` before
 * flags are validated.
 *
 * An alias that prepends positionals (`taps` → `tap list`) is a
 * *prefixed* alias. Those name a specific subcommand, so they must not
 * inherit the whole canonical flag table — `crew taps --recursive`
 * would otherwise parse, even though only `crew tap add` accepts it.
 * `aliasFlagKey` encodes that distinction for the parser.
 */

/** Every canonical command crew dispatches. Aliases must name one of these. */
export type CanonicalCommand =
  | "install"
  | "uninstall"
  | "update"
  | "list"
  | "search"
  | "info"
  | "tap"
  | "agents"
  | "autoupdate"
  | "doctor"
  | "cache"
  | "self-update"
  | "help"
  | "version";

/** Canonical command name plus positionals to prepend. */
type CommandAlias = readonly [canonical: CanonicalCommand, ...positionalPrefix: string[]];

export const COMMAND_ALIASES = {
  skills: ["list"],
  ls: ["list"],
  remove: ["uninstall"],
  rm: ["uninstall"],
  upgrade: ["update"],
  taps: ["tap", "list"],
  untap: ["tap", "remove"],
} as const satisfies Record<string, CommandAlias>;

/** A command word that is an alias for something else. */
export type AliasCommand = keyof typeof COMMAND_ALIASES;

/** Every command word a user can type: canonical commands plus aliases. */
export type VisibleCommand = CanonicalCommand | AliasCommand;

/**
 * The key the argv parser should use when looking up per-subcommand
 * flag tables. A bare alias (`rm` → `uninstall`) shares its canonical
 * command's flags. A prefixed alias (`taps` → `tap list`) names one
 * subcommand, so it gets no subcommand flags at all — matching the
 * strictness `crew taps --recursive` had before aliases were
 * canonicalized for flag lookup.
 */
export function aliasFlagKey(command: string): string | null {
  const alias = aliasFor(command);
  if (!alias) return command;
  if (alias.length > 1) return null;
  return alias[0];
}

/** The alias entry for a user-typed word, or undefined when it isn't an alias. */
export function aliasFor(command: string): CommandAlias | undefined {
  return (COMMAND_ALIASES as Record<string, CommandAlias>)[command];
}
