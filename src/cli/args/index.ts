/**
 * Argument parser, built on `yargs-parser` (the pure parser that
 * underlies the full `yargs` library, re-exported as `yargs/yargs`).
 *
 * We use yargs just as a parser, not as a full CLI engine — see
 * `./tables.ts` for the shared configuration and the flag tables.
 * `.strictOptions()` here makes unknown flags a parse failure we map to
 * `usage_error` (exit 4 per §13).
 */

import type { CommandFlags } from "../../commands/types.ts";
import { CrewError } from "../../core/errors.ts";
import {
  ARRAY_GLOBALS,
  BOOLEAN_GLOBALS,
  BOOLEAN_SUB,
  BUILT_IN_FLAGS,
  baseParser,
  STRING_GLOBALS,
  STRING_SUB,
  subFlags,
} from "./tables.ts";

/** Result of parsing. */
export interface ParsedArgs {
  readonly command: string;
  readonly subcommand: string | null;
  readonly positional: string[];
  readonly flags: CommandFlags;
}

/**
 * A yargs instance configured as a pure parser. Shared so the conventional
 * flag rewrite reads `--json` exactly as the real parse later will.
 */
function baseParser() {
  return yargsFactory().exitProcess(false).help(false).version(false).parserConfiguration({
    "parse-numbers": false,
    "camel-case-expansion": false,
    "dot-notation": false,
    "boolean-negation": false,
    "duplicate-arguments-array": true,
  });
}

/**
 * The effective `--json` value for a rewritten argv, asked of the real
 * parser rather than pattern-matched.
 *
 * `--json`, `--json=true`, and `--json=false` are all valid spellings and
 * the last occurrence wins, so scanning for a bare `--json` token would
 * disagree with `crew help --json=…` on exactly the forms it can't see.
 */
function effectiveJson(argv: readonly string[]): boolean {
  const parsed = baseParser()
    .boolean(["json"])
    .parseSync([...argv]);
  return Boolean(parsed["json"]);
}

/**
 * §5.5 conventional flags, applied as an argv rewrite before the command
 * is dispatched:
 *
 *   - `--help` / `-h` anywhere → `help <command>`, where `<command>` is
 *     the first non-flag token (skipping only a LEADING `help`, so
 *     `crew help help --help` still reaches the `help` page). Every other
 *     flag is dropped; `--json` is re-emitted at its effective value.
 *   - `--version` / `-v` / `-V` as the FIRST token → `version`. After a
 *     command name they stay unknown flags, so `-v` remains free for a
 *     future `--verbose` short form.
 *
 * `--help` wins over `--version` whenever both appear (§5.5): help is the
 * broader request, and it makes `crew --version --help` order-independent.
 */
function rewriteConventionalFlags(argv: readonly string[]): readonly string[] {
  const wantsHelp = argv.some((a) => a === "--help" || a === "-h");
  const first = argv[0];
  const wantsVersion = first === "--version" || first === "-v" || first === "-V";
  if (!(wantsHelp || wantsVersion)) return argv;

  const json = effectiveJson(argv) ? ["--json"] : [];
  // §5.5 precedence: `--help` beats a first-token version flag.
  if (wantsHelp) {
    const rest = argv[0] === "help" ? argv.slice(1) : argv;
    const command = rest.find((a) => !a.startsWith("-"));
    return command === undefined ? ["help", ...json] : ["help", command, ...json];
  }
  return ["version", ...json];
}

/** Parse raw argv (already stripped of `node` and script name). */
export function parseArgs(rawArgv: readonly string[]): ParsedArgs {
  const argv = rewriteConventionalFlags(rawArgv);
  // Bare `crew` with no arguments: route to `help` so the user sees an
  // overview and examples rather than a "usage_error".
  const effective = argv.length === 0 ? (["help"] as readonly string[]) : argv;
  const command = effective[0]!;
  const rest = effective.slice(1);

  // Alias-aware: `subFlags` resolves `rm` to uninstall's tables (§5.1).
  const booleans = [...BOOLEAN_GLOBALS, ...subFlags(BOOLEAN_SUB, command)];
  const strings = [...STRING_GLOBALS, ...subFlags(STRING_SUB, command)];

  let parsed: Record<string, unknown>;
  try {
    parsed = baseParser()
      // `.strictOptions()` rejects unknown `--flags` but leaves positional
      // arguments alone (our subcommand grammar is positional — `crew tap
      // list`, `crew install <ref>`).
      .strictOptions()
      .array([...ARRAY_GLOBALS])
      // `--agent` is repeatable but each occurrence takes exactly one
      // value (`--agent a --agent b`); without `nargs` yargs would
      // greedily absorb every subsequent positional argument into the array.
      .nargs(Object.fromEntries(ARRAY_GLOBALS.map((n) => [n, 1])))
      .boolean(booleans)
      .string([...strings, ...ARRAY_GLOBALS])
      .fail((msg, err) => {
        // `msg` is set for validation failures (unknown flags, missing
        // values); `err` is set when the parser itself threw. Either way,
        // surface as a `usage_error`.
        throw new CrewError("usage_error", msg ?? (err as Error)?.message ?? "argument error");
      })
      .parseSync(rest as string[]);
  } catch (err) {
    // yargs's `.fail()` handler always throws a `CrewError`, so this
    // rethrow narrows correctly without a separate fallback.
    throw err as CrewError;
  }

  const positional = ((parsed["_"] as unknown[]) ?? []).map(String);

  rejectRepeatedScalars(parsed, rest);

  const scope = stringOrUndefined(parsed["scope"]) ?? "user";
  if (scope !== "user" && scope !== "project")
    throw new CrewError(
      "usage_error",
      `--scope must be \`user\` or \`project\` (got \`${scope}\`) — \`user\` is the default`,
    );
  const agent = asStringArray(parsed["agent"]);

  const extras: Record<string, string | boolean> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (key === "_" || key === "$0") continue;
    if (BUILT_IN_FLAGS.has(key)) {
      continue;
    }
    if (typeof value === "string" || typeof value === "boolean") {
      extras[key] = value;
    }
  }

  const flags: CommandFlags = {
    scope,
    agent,
    dryRun: Boolean(parsed["dry-run"]),
    json: Boolean(parsed["json"]),
    quiet: Boolean(parsed["quiet"]),
    verbose: Boolean(parsed["verbose"]),
    yes: Boolean(parsed["yes"]),
    force: Boolean(parsed["force"]),
    extras,
  };

  return { command, subcommand: null, positional, flags };
}

/**
 * Reject a non-repeatable flag passed more than once.
 *
 * Two detections are needed because yargs represents the two flag
 * kinds differently. `duplicate-arguments-array` hands back an ARRAY
 * for a repeated value flag, which `extras` would then silently drop.
 * A repeated BOOLEAN, by contrast, collapses to plain `true` and leaves
 * no trace in the parsed result at all, so the only witness is raw
 * argv. Either way the user stated something twice and §5.2 says only
 * `--agent` may repeat, so fail loudly rather than quietly picking one.
 */
function rejectRepeatedScalars(parsed: Record<string, unknown>, argv: readonly string[]): void {
  const repeatable = new Set<string>(ARRAY_GLOBALS);
  for (const [key, value] of Object.entries(parsed)) {
    if (key === "_" || key === "$0" || repeatable.has(key)) continue;
    if (!Array.isArray(value)) continue;
    throw repeatedFlagError(key);
  }
  const seen = new Set<string>();
  for (const token of argv) {
    // Only long `--flag` forms; `--` ends flag parsing, and a bare `-`
    // or a value like `--scope=user`'s tail is not a flag occurrence.
    if (token === "--") break;
    if (!token.startsWith("--") || token.length === 2) continue;
    const name = token.slice(2).split("=")[0]!;
    if (repeatable.has(name)) continue;
    if (seen.has(name)) throw repeatedFlagError(name);
    seen.add(name);
  }
}

function repeatedFlagError(flag: string): CrewError {
  return new CrewError(
    "usage_error",
    `\`--${flag}\` was given more than once — it takes a single value`,
    { flag },
  );
}

function stringOrUndefined(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.map(String);
  }
  if (typeof v === "string") return [v];
  return [];
}
