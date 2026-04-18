/**
 * Hand-rolled argument parser.
 *
 * We avoid a dependency so the bundled binary stays tiny. Parsing is
 * simple: the first positional is the subcommand; any token starting
 * with `--` is a flag; everything else is a positional. The parser
 * recognizes long-form flags only (`--foo`, `--foo=bar`, `--foo bar`).
 * Boolean flags require no value.
 */

import { CrewError } from "../core/errors.ts";
import type { CommandFlags } from "../commands/types.ts";

/** Result of parsing. */
export interface ParsedArgs {
  readonly command: string;
  readonly subcommand: string | null;
  readonly positional: string[];
  readonly flags: CommandFlags;
}

/** Known boolean global flags. */
const BOOLEAN_GLOBALS = new Set(["dry-run", "json", "quiet", "verbose", "yes", "force"]);
/** Known value-taking global flags. */
const VALUE_GLOBALS = new Set(["scope", "target", "from-git"]);
/** Boolean flags for specific subcommands. */
const BOOLEAN_SUB: Record<string, Set<string>> = {
  doctor: new Set(["verify", "repair"]),
};
/** Value-taking flags for specific subcommands. */
const VALUE_SUB: Record<string, Set<string>> = {
  autoupdate: new Set(["interval"]),
};

/** Parse raw argv (already stripped of `node` and script name). */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  if (argv.length === 0) {
    throw new CrewError("usage_error", "usage: crew <command> [options] [args...]");
  }
  const command = argv[0]!;
  const rest = argv.slice(1);

  const positional: string[] = [];
  const rawFlags: Record<string, string | boolean | string[]> = {};

  const boolSet = new Set<string>([...BOOLEAN_GLOBALS, ...(BOOLEAN_SUB[command] ?? [])]);
  const valueSet = new Set<string>([...VALUE_GLOBALS, ...(VALUE_SUB[command] ?? [])]);

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i]!;
    if (token === "--") {
      positional.push(...rest.slice(i + 1));
      break;
    }
    if (token.startsWith("--")) {
      const body = token.slice(2);
      const eqIdx = body.indexOf("=");
      const name = eqIdx >= 0 ? body.slice(0, eqIdx) : body;
      const inlineValue = eqIdx >= 0 ? body.slice(eqIdx + 1) : undefined;
      if (boolSet.has(name)) {
        if (inlineValue !== undefined) {
          throw new CrewError("usage_error", `flag --${name} does not take a value`);
        }
        rawFlags[name] = true;
        continue;
      }
      if (valueSet.has(name)) {
        let value: string;
        if (inlineValue !== undefined) value = inlineValue;
        else if (i + 1 < rest.length) {
          value = rest[++i]!;
        } else {
          throw new CrewError("usage_error", `flag --${name} requires a value`);
        }
        if (name === "target") {
          const prev = (rawFlags["target"] as string[] | undefined) ?? [];
          rawFlags["target"] = [...prev, value];
        } else {
          rawFlags[name] = value;
        }
        continue;
      }
      throw new CrewError("usage_error", `unknown flag: --${name}`);
    }
    if (token.startsWith("-") && token.length > 1) {
      throw new CrewError("usage_error", `unknown flag: ${token}`);
    }
    positional.push(token);
  }

  const scope = (rawFlags["scope"] as string | undefined) ?? "user";
  if (scope !== "user" && scope !== "project") {
    throw new CrewError("usage_error", `--scope must be \`user\` or \`project\` (got ${scope})`);
  }

  const target = (rawFlags["target"] as string[] | undefined) ?? [];

  const extras: Record<string, string | boolean> = {};
  for (const [k, v] of Object.entries(rawFlags)) {
    if (["scope", "target", "dry-run", "json", "quiet", "verbose", "yes", "force"].includes(k)) continue;
    if (Array.isArray(v)) continue;
    extras[k] = v;
  }

  const flags: CommandFlags = {
    scope,
    target,
    dryRun: Boolean(rawFlags["dry-run"]),
    json: Boolean(rawFlags["json"]),
    quiet: Boolean(rawFlags["quiet"]),
    verbose: Boolean(rawFlags["verbose"]),
    yes: Boolean(rawFlags["yes"]),
    force: Boolean(rawFlags["force"]),
    extras,
  };

  return {
    command,
    subcommand: null,
    positional,
    flags,
  };
}
