/**
 * The §5.5 conventional flags (`--help`/`-h`, `--version`/`-v`/`-V`),
 * applied as an argv rewrite before the command is dispatched.
 *
 * Both the help target and the effective `--json` value are asked of the
 * real parser rather than pattern-matched, so this rewrite and the parse
 * that follows can't disagree.
 */

import { baseParser, withFlagTables } from "./tables.ts";

/**
 * The positional arguments of `argv`, asked of the parser rather than
 * scanned for.
 *
 * A flag's VALUE is also a non-flag token, so `argv.find(a =>
 * !a.startsWith("-"))` answers `project` for `crew --scope project
 * install --help`. Only the parser knows `project` belongs to `--scope`.
 *
 * Two passes: the first uses the global tables to learn the command, the
 * second re-parses with that command's own tables. The second pass is
 * what makes `crew uninstall --prune foo --help` see `foo` as a
 * positional — without it the unknown `--prune` consumes it as a value.
 */
function positionalsOf(argv: readonly string[]): string[] {
  const first = withFlagTables(baseParser(), undefined).parseSync([...argv]);
  const command = ((first["_"] as unknown[]) ?? []).map(String)[0];
  const parsed = withFlagTables(baseParser(), command).parseSync([...argv]);
  return ((parsed["_"] as unknown[]) ?? []).map(String);
}

/**
 * The effective `--json` value for an argv.
 *
 * `--json`, `--json=true`, `--json=false`, and spaced `--json true` are
 * all valid spellings and the last occurrence wins, so scanning for a
 * bare `--json` token would disagree with `crew help --json=…` on
 * exactly the forms it can't see.
 */
function effectiveJson(argv: readonly string[]): boolean {
  const parsed = withFlagTables(baseParser(), undefined).parseSync([...argv]);
  return Boolean(parsed["json"]);
}

/**
 * Rewrite conventional flags onto the canonical commands:
 *
 *   - `--help` / `-h` anywhere → `help <command>`, where `<command>` is
 *     the first POSITIONAL (skipping only a LEADING `help`, so `crew help
 *     help --help` still reaches the `help` page). Every other flag is
 *     dropped; `--json` is re-emitted at its effective value.
 *   - `--version` / `-v` / `-V` as the FIRST token → `version`. After a
 *     command name they stay unknown flags, so `-v` remains free for a
 *     future `--verbose` short form.
 *
 * `--help` wins over `--version` whenever both appear (§5.5): help is the
 * broader request, and it makes `crew --version --help` order-independent.
 */
export function rewriteConventionalFlags(argv: readonly string[]): readonly string[] {
  const wantsHelp = argv.some((a) => a === "--help" || a === "-h");
  const first = argv[0];
  const wantsVersion = first === "--version" || first === "-v" || first === "-V";
  if (!(wantsHelp || wantsVersion)) return argv;

  const json = effectiveJson(argv) ? ["--json"] : [];
  // §5.5 precedence: `--help` beats a first-token version flag.
  if (wantsHelp) {
    const rest = argv[0] === "help" ? argv.slice(1) : argv;
    const command = positionalsOf(rest)[0];
    return command === undefined ? ["help", ...json] : ["help", command, ...json];
  }
  return ["version", ...json];
}
