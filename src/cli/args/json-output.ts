/**
 * Detecting `--json` from the RAW argv tokens (§5.2, C-CLI-08c).
 *
 * Separate from `./index.ts` because it answers for argv that yargs
 * cannot represent: a parse failure leaves no `ParsedArgs` at all, yet
 * the user's requested output mode still has to be honored.
 */

/**
 * Whether argv asks for `--json`, read straight off the raw tokens.
 *
 * A parse-stage failure has no `ParsedArgs` to consult, but the user's
 * requested output mode still has to be honored (§5.2, C-CLI-08c) — a
 * script piping stdout must get the structured error, not human text on
 * stderr. So this deliberately does not go through yargs: it must answer
 * even for the argv that made yargs throw.
 *
 * Last occurrence wins, matching yargs, so `--json --json=false` is false.
 * A bare `--json` as the final token is true.
 */
export function wantsJsonOutput(argv: readonly string[]): boolean {
  let json = false;
  for (const token of argv) {
    if (token === "--") break;
    if (token === "--json") json = true;
    else if (token.startsWith("--json=")) json = token.slice("--json=".length) !== "false";
  }
  return json;
}
