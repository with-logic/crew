/**
 * Argument parser, built on `yargs-parser` (the pure parser that
 * underlies the full `yargs` library, re-exported as `yargs/yargs`).
 *
 * We use yargs just as a parser, not as a full CLI engine:
 *
 *   - `parseSync()` to avoid any promise machinery;
 *   - `.exitProcess(false)` so yargs never calls `process.exit()`;
 *   - `.help(false).version(false)` so `--help`/`--version` don't get
 *     intercepted (crew has its own `help`/`version` subcommands);
 *   - `.strict()` so unknown flags become a parse failure we map to
 *     `usage_error` (exit 4 per §13).
 *
 * Boolean and string flags are declared explicitly so yargs produces a
 * well-typed result instead of guessing from values.
 */

import yargsFactory from "yargs/yargs";
import type { CommandFlags } from "../commands/types.ts";
import { CrewError } from "../core/errors.ts";
import { flagTableKeyFor } from "./alias-registry.ts";

/** Result of parsing. */
export interface ParsedArgs {
  readonly command: string;
  readonly subcommand: string | null;
  readonly positional: string[];
  readonly flags: CommandFlags;
}

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

/** Global boolean flags. */
const BOOLEAN_GLOBALS = ["dry-run", "json", "quiet", "verbose", "yes", "force"] as const;
/** Global string flags (single-value except `target`, which is repeatable). */
const STRING_GLOBALS = ["scope", "from-git"] as const;
/** Subcommand-specific boolean flags. */
const BOOLEAN_SUB: Record<string, readonly string[]> = {
  doctor: ["verify", "repair"],
  install: ["tap", "bundle", "skill", "recursive"],
  tap: ["recursive"],
  uninstall: ["prune"],
  "self-update": ["check"],
};
/** Subcommand-specific string flags. */
const STRING_SUB: Record<string, readonly string[]> = {
  autoupdate: ["interval"],
  // `--tap <name>` narrows `crew list` to one tap (a value flag here;
  // install's `--tap` is a presence flag — the tables are per-command).
  list: ["tap"],
  // `--version <tag>` pins a specific release (e.g. `v0.4.0`).
  "self-update": ["version"],
};
/**
 * Bare command aliases, for flag-table lookup only.
 *
 * Only aliases that resolve to a canonical command with no positional
 * prefix belong here. `taps` (→ `tap list`) and `untap` (→ `tap remove`)
 * must NOT be listed: they target a subcommand that ignores `tap`'s own
 * flags, and inheriting that table would start accepting flags nothing
 * honors. Dispatch owns the real alias table (`src/cli/dispatch.ts`).
 */
/** Flags that should always be collected into a list. */
const ARRAY_GLOBALS = ["agent"] as const;
/** The subset of flags that is part of the public `CommandFlags` surface. */
const BUILT_IN_FLAGS = new Set<string>([...BOOLEAN_GLOBALS, ...STRING_GLOBALS, ...ARRAY_GLOBALS]);

/** Parse raw argv (already stripped of `node` and script name). */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  // Bare `crew` with no arguments: route to `help` so the user sees an
  // overview and examples rather than a "usage_error".
  const effective = argv.length === 0 ? (["help"] as readonly string[]) : argv;
  const command = effective[0]!;
  const rest = effective.slice(1);

  // Bare aliases (`skills` → `list`) take their canonical command's
  // flags; without this the parser rejects a flag the alias documents.
  // Prefixed aliases (`taps` → `tap list`) are deliberately excluded:
  // they resolve to a *subcommand* that ignores the parent's flags, so
  // they keep rejecting them.
  const flagKey = flagTableKeyFor(command);
  const booleans = [...BOOLEAN_GLOBALS, ...(BOOLEAN_SUB[flagKey] ?? [])];
  const strings = [...STRING_GLOBALS, ...(STRING_SUB[flagKey] ?? [])];

  let parsed: Record<string, unknown>;
  try {
    parsed = yargsFactory()
      .exitProcess(false)
      .help(false)
      .version(false)
      // `.strictOptions()` rejects unknown `--flags` but leaves positional
      // arguments alone (our subcommand grammar is positional — `crew tap
      // list`, `crew install <ref>`).
      .strictOptions()
      .parserConfiguration({
        "parse-numbers": false,
        "camel-case-expansion": false,
        "dot-notation": false,
        "boolean-negation": false,
        "duplicate-arguments-array": true,
      })
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

  rejectRepeatedScalars(parsed);

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
    scopeGiven: parsed["scope"] !== undefined,
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
 * Reject a non-repeatable flag that was given more than once.
 *
 * `duplicate-arguments-array` makes yargs hand back an array for a
 * repeated flag. Only `--agent` is repeatable; for every other flag an
 * array value would be silently dropped downstream (`extras` keeps only
 * strings and booleans) or fall back to its default, so the user's
 * explicit choice would vanish without a word. Fail loudly instead.
 */
function rejectRepeatedScalars(parsed: Record<string, unknown>): void {
  const repeatable = new Set<string>(ARRAY_GLOBALS);
  for (const [key, value] of Object.entries(parsed)) {
    if (key === "_" || key === "$0" || repeatable.has(key)) continue;
    if (!Array.isArray(value)) continue;
    throw new CrewError(
      "usage_error",
      `\`--${key}\` was given more than once — it takes a single value`,
      { flag: key },
    );
  }
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
