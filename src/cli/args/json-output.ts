/**
 * Reading the `--json` output mode straight off raw argv (§5.2, C-CLI-08c).
 *
 * Separate from `./index.ts` because it answers before a parse exists:
 * the error path needs the mode for argv that yargs rejected.
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
 *
 * The value forms follow yargs' own boolean coercion, verified against
 * the parser rather than assumed: it accepts a SPACE-separated value
 * (`--json false`), and treats any value other than a literal `true` as
 * false — so `--json=FALSE`, `--json=0`, and `--json=no` are all false.
 * Guessing differently here would hand a script human-readable text on
 * an invocation the real parse would have treated as JSON, or vice versa.
 */
export function wantsJsonOutput(argv: readonly string[]): boolean {
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token === "--") break;
    if (token === "--json") {
      // yargs consumes a following bare `true`/`false` as the value.
      const next = argv[i + 1];
      if (next === "true" || next === "false") {
        json = next === "true";
        i++;
      } else json = true;
    } else if (token.startsWith("--json=")) json = token.slice("--json=".length) === "true";
  }
  return json;
}
