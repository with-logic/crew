/**
 * Argument parsing for the known-taps maintenance script (§16.2.1).
 */

import { join } from "node:path";
import type { KnownTapTrust } from "../../src/known-taps/types.ts";

export const COMMON_FLAGS = ["manifest", "out", "work-dir"] as const;

export interface Paths {
  readonly manifestPath: string;
  readonly outPath: string;
  readonly workDir: string;
}

export interface ParsedArgs {
  readonly positionals: readonly string[];
  readonly flags: ReadonlyMap<string, string | true>;
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      i++;
      continue;
    }
    const name = arg.slice(2);
    if (name === "all") {
      flags.set(name, true);
      i++;
      continue;
    }
    i++;
    flags.set(name, requireValue(argv, i, arg));
    i++;
  }
  return { positionals, flags };
}

export function pathsFrom(root: string, defaultWorkDir: string, parsed: ParsedArgs): Paths {
  return {
    manifestPath: flagValue(parsed, "manifest") ?? join(root, "known-taps", "manifest.json"),
    outPath: flagValue(parsed, "out") ?? join(root, "src", "known-taps", "generated.ts"),
    workDir: flagValue(parsed, "work-dir") ?? defaultWorkDir,
  };
}

export function updateSelection(parsed: ParsedArgs): "all" | readonly string[] {
  const all = parsed.flags.get("all") === true;
  if (all && parsed.positionals.length > 0) {
    throw new Error("use either --all or tap names, not both");
  }
  if (!all && parsed.positionals.length === 0) {
    throw new Error("expected --all or one or more tap names");
  }
  return all ? "all" : parsed.positionals;
}

export function trustFlag(parsed: ParsedArgs): KnownTapTrust | undefined {
  const trust = flagValue(parsed, "trust");
  if (trust === undefined) return undefined;
  if (trust === "official" || trust === "curated") return trust;
  throw new Error("--trust must be `official` or `curated`");
}

export function flagValue(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.flags.get(name);
  if (typeof value === "string") return value;
  return undefined;
}

export function ensureFlags(parsed: ParsedArgs, allowed: readonly string[]): void {
  const allowedFlags = new Set(allowed);
  for (const flag of parsed.flags.keys()) {
    if (!allowedFlags.has(flag)) throw new Error(`unknown argument \`--${flag}\``);
  }
}

export function usage(): string {
  return [
    "usage: bun run known-taps <command>",
    "",
    "commands:",
    "  build",
    "  check",
    "  update --all | update <name> [<name>...]",
    "  add <name> <url> [--description text] [--subpath path] [--trust curated|official] [--tracking-ref ref]",
  ].join("\n");
}

function requireValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index];
  if (value !== undefined && value.length > 0) return value;
  throw new Error(`${flag} needs a value`);
}
