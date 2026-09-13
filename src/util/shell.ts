/**
 * Shell quoting for commands crew prints for the user to run (§13
 * "human-mode error quality").
 *
 * A printed command is an instruction, so anything interpolated into it
 * must survive a paste as one literal argument. A skill reference can
 * carry an `@<ref>` tail, and §8.4 constrains a git-ref only to "no
 * whitespace and no slash" — `$(…)`, backticks, `;`, `|`, and `&&` are
 * all legal there. Unquoted, a suggested `crew install <tap>@<ref>`
 * would hand the shell whatever the ref contained.
 */

/** Unreserved POSIX characters that never need quoting. */
const SHELL_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;

/**
 * Quote a value so a shell receives it as one literal argument.
 *
 * Single quotes are the only POSIX construct with no escapes inside, so
 * a literal single quote is emitted by closing, escaping, and
 * reopening. Values that need no quoting are returned unchanged, so
 * ordinary suggestions stay readable.
 */
export function shellQuote(value: string): string {
  if (value.length > 0 && SHELL_SAFE.test(value)) return value;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
