/**
 * The §5.5 conventional flags (`--help`/`-h`, `--version`/`-v`/`-V`),
 * applied as an argv rewrite before the command is dispatched.
 *
 * Both the help target and the effective `--json` value are asked of the
 * real parser rather than pattern-matched, so this rewrite and the parse
 * that follows can't disagree.
 */

import { CrewError } from "../../core/errors.ts";
import { baseParser, EVERY_COMMAND, withFlagTables } from "./tables.ts";

/**
 * Run a discovery parse, translating a parser failure into the stable
 * `usage_error` (§13, exit 4).
 *
 * The real parse in `./index.ts` installs a `.fail()` handler for this;
 * these parses run BEFORE it, so without translation a malformed value
 * flag (`crew --help --agent`) escapes as a raw `YError`. The CLI's
 * top-level catch treats any throw as a `CrewError`, so that surfaced as
 * `Error (undefined)` with an undefined exit code — a crash with no
 * error name rather than a usage message.
 */
function discover<T>(parse: () => T): T {
  try {
    return parse();
  } catch (err) {
    throw new CrewError("usage_error", (err as Error)?.message ?? "argument error");
  }
}

/**
 * The positional arguments of `argv`, asked of the parser rather than
 * scanned for.
 *
 * A flag's VALUE is also a non-flag token, so `argv.find(a =>
 * !a.startsWith("-"))` answers `project` for `crew --scope project
 * install --help`. Only the parser knows `project` belongs to `--scope`.
 *
 * Two passes. The first is widened to EVERY command's tables, because a
 * command-scoped flag may appear BEFORE its command (`crew --prune
 * uninstall --help`) — knowing only the globals there, the unknown
 * `--prune` would swallow `uninstall` and the target would be lost. That
 * pass is only used to learn the command; the second re-parses with that
 * one command's tables so arity is resolved exactly, which is what
 * `crew autoupdate enable --interval 4h --help` needs.
 *
 * Widening is safe here and wrong for the real parse: discovery only asks
 * which token is the command, while the real parse in `./index.ts` must
 * still reject a flag that belongs to a different command.
 */
function positionalsOf(argv: readonly string[]): string[] {
  const first = discover(() => withFlagTables(baseParser(), EVERY_COMMAND).parseSync([...argv]));
  const command = ((first["_"] as unknown[]) ?? []).map(String)[0];
  const parsed = discover(() => withFlagTables(baseParser(), command).parseSync([...argv]));
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
  const parsed = discover(() => withFlagTables(baseParser(), EVERY_COMMAND).parseSync([...argv]));
  return Boolean(parsed["json"]);
}

/**
 * The `--json` tokens to carry through a rewrite.
 *
 * §5.2 makes a repeated `--json` a `usage_error`, and the canonical form
 * gets that from the real parse. Collapsing the repeats to one effective
 * value here would launder them, so every spelled occurrence is
 * forwarded verbatim and the real parse rejects the rewritten form the
 * same way. A single occurrence carries its effective value (`--json
 * true`, `--json=false`, …), which only the parser can tell.
 */
function jsonFlags(argv: readonly string[]): readonly string[] {
  const spelled = argv.filter((a) => a === "--json" || a.startsWith("--json="));
  if (spelled.length > 1) return spelled;
  return effectiveJson(argv) ? ["--json"] : [];
}

/**
 * Rewrite conventional flags onto the canonical commands:
 *
 *   - `--help` / `-h` anywhere → `help <command>`, where `<command>` is
 *     the first POSITIONAL (skipping only a LEADING `help`, so `crew help
 *     help --help` still reaches the `help` page). Every other flag is
 *     dropped; `--json` is re-emitted at its effective value, or
 *     verbatim when repeated so the parse rejects it (§5.2).
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

  const json = jsonFlags(argv);
  // §5.5 precedence: `--help` beats a first-token version flag.
  if (wantsHelp) {
    const rest = argv[0] === "help" ? argv.slice(1) : argv;
    const command = positionalsOf(rest)[0];
    return command === undefined ? ["help", ...json] : ["help", command, ...json];
  }
  return ["version", ...json];
}
