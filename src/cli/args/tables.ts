/**
 * Flag tables and the shared yargs parser configuration (§5.2, §5.3).
 *
 * One place declares which flags exist and which take values, so the
 * conventional-flag rewrite in `./conventional-flags.ts` and the real
 * parse in `./index.ts` can never disagree about what is a flag value
 * and what is a positional.
 */

import yargsFactory from "yargs/yargs";
import { lookup } from "../../util/registry.ts";
import { aliasFlagKey } from "../aliases.ts";

/** Global boolean flags. */
export const BOOLEAN_GLOBALS = ["dry-run", "json", "quiet", "verbose", "yes", "force"] as const;
/** Global string flags (single-value). */
export const STRING_GLOBALS = ["scope"] as const;
/** Subcommand-specific boolean flags. */
export const BOOLEAN_SUB: Record<string, readonly string[]> = {
  doctor: ["verify", "repair"],
  install: ["tap", "bundle", "skill", "recursive"],
  tap: ["recursive"],
  uninstall: ["prune"],
  "self-update": ["check"],
};
/** Subcommand-specific string flags. */
export const STRING_SUB: Record<string, readonly string[]> = {
  autoupdate: ["interval"],
  // `--from-git <url>` is an explicit git source (§5.3); only install takes it.
  install: ["from-git"],
  // `--version <tag>` pins a specific release (e.g. `v0.4.0`).
  "self-update": ["version"],
};
/** Flags that should always be collected into a list. */
export const ARRAY_GLOBALS = ["agent"] as const;
/** The subset of flags that is part of the public `CommandFlags` surface. */
export const BUILT_IN_FLAGS = new Set<string>([
  ...BOOLEAN_GLOBALS,
  ...STRING_GLOBALS,
  ...ARRAY_GLOBALS,
]);

/**
 * A yargs instance configured as a pure parser:
 *
 *   - `parseSync()` to avoid any promise machinery;
 *   - `.exitProcess(false)` so yargs never calls `process.exit()`;
 *   - `.help(false).version(false)` so `--help`/`--version` aren't
 *     intercepted (crew has its own `help`/`version` subcommands).
 */
export function baseParser() {
  return yargsFactory().exitProcess(false).help(false).version(false).parserConfiguration({
    "parse-numbers": false,
    "camel-case-expansion": false,
    "dot-notation": false,
    "boolean-negation": false,
    "duplicate-arguments-array": true,
  });
}

/**
 * Configure `p` with the flag tables that apply to `command` (the global
 * tables plus that command's own), so the parser knows which tokens are
 * flag values and which are positionals.
 *
 * `help` is declared boolean so `--help` never swallows the word after it.
 */
export function withFlagTables(p: ReturnType<typeof baseParser>, command: string | undefined) {
  return p
    .boolean([...BOOLEAN_GLOBALS, "help", ...subFlags(BOOLEAN_SUB, command)])
    .string([...STRING_GLOBALS, ...subFlags(STRING_SUB, command)])
    .array([...ARRAY_GLOBALS])
    .nargs(Object.fromEntries(ARRAY_GLOBALS.map((n) => [n, 1])));
}

/**
 * The per-subcommand flags `command` owns, resolved through its alias.
 *
 * A bare alias shares its canonical command's flag tables (`crew rm
 * --prune`). A prefixed alias (`taps` → `tap list`) names one
 * subcommand, so it inherits no subcommand flags — `crew taps
 * --recursive` stays a usage_error. `lookup` keeps a prototype-named
 * word (`crew constructor`) from resolving an inherited member.
 */
export function subFlags(
  table: Readonly<Record<string, readonly string[]>>,
  command: string | undefined,
): readonly string[] {
  if (command === undefined) return [];
  const key = aliasFlagKey(command);
  if (key === null) return [];
  return lookup(table, key) ?? [];
}
