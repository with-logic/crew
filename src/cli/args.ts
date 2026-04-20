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

/** Result of parsing. */
export interface ParsedArgs {
  readonly command: string;
  readonly subcommand: string | null;
  readonly positional: string[];
  readonly flags: CommandFlags;
}

/** Global boolean flags. */
const BOOLEAN_GLOBALS = ["dry-run", "json", "quiet", "verbose", "yes", "force"] as const;
/** Global string flags (single-value except `target`, which is repeatable). */
const STRING_GLOBALS = ["scope", "from-git"] as const;
/** Subcommand-specific boolean flags. */
const BOOLEAN_SUB: Record<string, readonly string[]> = {
  doctor: ["verify", "repair"],
  uninstall: ["prune"],
  "self-update": ["check"],
};
/** Subcommand-specific string flags. */
const STRING_SUB: Record<string, readonly string[]> = {
  autoupdate: ["interval"],
  // `--version <tag>` pins a specific release (e.g. `v0.4.0`).
  "self-update": ["version"],
};
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

  const booleans = [...BOOLEAN_GLOBALS, ...(BOOLEAN_SUB[command] ?? [])];
  const strings = [...STRING_GLOBALS, ...(STRING_SUB[command] ?? [])];

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
