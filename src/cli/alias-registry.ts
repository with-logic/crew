/**
 * The single registry of command aliases (§5.1).
 *
 * Two consumers need alias metadata and must not disagree about it:
 * `dispatch.ts` routes an alias to its canonical handler, and `args.ts`
 * decides which command's flag table to parse against. When those two
 * drifted apart, `crew skills --tap core` parsed against the wrong table
 * and rejected a flag the alias is documented to accept.
 *
 * An alias is *bare* when it resolves to a canonical command with no
 * positional prefix (`skills` → `list`). It inherits that command's
 * flags, because the two invocations are the same command.
 *
 * An alias is *prefixed* when it injects positionals (`taps` → `tap
 * list`). It must NOT inherit the canonical command's whole flag table:
 * `crew tap add` accepts `--recursive`, but `crew taps` resolves to `tap
 * list`, which ignores it, so inheriting would make `crew taps
 * --recursive` silently acceptable. Prefixed aliases therefore parse
 * against the global flags only.
 */

/** A canonical command name, plus any positionals the alias injects. */
export type CommandAlias = readonly [canonical: string, ...positionalPrefix: string[]];

/** Every alias crew accepts, keyed by the word the user types. */
export const COMMAND_ALIASES: Record<string, CommandAlias> = {
  skills: ["list"],
  taps: ["tap", "list"],
  untap: ["tap", "remove"],
};

/**
 * The command whose flag table `command` should be parsed against.
 *
 * Bare aliases resolve to their canonical command; prefixed aliases and
 * non-aliases resolve to themselves, so they pick up only the flags
 * their own resolved subcommand declares.
 */
export function flagTableKeyFor(command: string): string {
  const alias = COMMAND_ALIASES[command];
  if (alias === undefined) return command;
  if (alias.length > 1) return command;
  return alias[0];
}
