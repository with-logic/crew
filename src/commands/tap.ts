/**
 * `crew tap {add,remove,list}` (§16).
 *
 * Add writes a new tap entry into config.yaml and performs the initial
 * clone. Remove deletes the local clone and removes the entry — with a
 * special rule for the default `core` tap which requires `--force`.
 * List prints every tap with its URL and last-fetched time (stat mtime
 * of the clone directory).
 */

import { statSync } from "node:fs";
import { CrewError } from "../core/errors.ts";
import { readConfig, writeConfig } from "../config/load.ts";
import { DEFAULT_TAP_NAME } from "../config/defaults.ts";
import { tapPath } from "../core/paths.ts";
import { ensureRepo } from "../git/repo.ts";
import { rmrf } from "../util/fs.ts";
import { withStateLock } from "../state/lock.ts";
import type { CommandContext, CommandOutput } from "./types.ts";

export function tapCommand(ctx: CommandContext): CommandOutput {
  const sub = ctx.positional[0];
  const rest = ctx.positional.slice(1);
  if (sub === "add") return tapAdd(ctx, rest);
  if (sub === "remove") return tapRemove(ctx, rest);
  if (sub === "list") return tapList(ctx);
  throw new CrewError("usage_error", "usage: crew tap {add|remove|list} ...");
}

function tapAdd(ctx: CommandContext, args: readonly string[]): CommandOutput {
  if (args.length < 1) throw new CrewError("usage_error", "usage: crew tap add <git-url> [<name>]");
  const url = args[0]!;
  const explicitName = args[1];
  const name = explicitName ?? deriveTapName(url);
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new CrewError("usage_error", `invalid tap name: ${name}`);
  }
  if (!ctx.flags.yes) {
    // In `--json` or non-TTY mode we require `--yes`. The CLI wrapper will
    // have already set `--yes` based on `stdin.isTTY`; if we get here
    // without it, the user must opt in explicitly.
    // We surface a clear error rather than prompting from a subroutine.
    // (Interactive prompting would couple this to process.stdin which
    // breaks testability.)
    throw new CrewError("usage_error", "confirmation required for `crew tap add`; pass --yes");
  }
  withStateLock(() => {
    const config = readConfig(ctx.home);
    if (config.taps.some((t) => t.name === name)) {
      throw new CrewError("usage_error", `tap \`${name}\` already exists`);
    }
    const updated = { ...config, taps: [...config.taps, { name, url }] };
    writeConfig(updated, ctx.home);
    ensureRepo(url, tapPath(name, ctx.home));
  }, ctx.home);
  return {
    exitCode: 0,
    human: [`added tap ${name} → ${url}`],
    json: { name, url },
  };
}

function tapRemove(ctx: CommandContext, args: readonly string[]): CommandOutput {
  if (args.length !== 1) throw new CrewError("usage_error", "usage: crew tap remove <name>");
  const name = args[0]!;
  withStateLock(() => {
    const config = readConfig(ctx.home);
    if (!config.taps.some((t) => t.name === name)) {
      throw new CrewError("usage_error", `tap \`${name}\` is not configured`);
    }
    if (name === DEFAULT_TAP_NAME && !ctx.flags.force) {
      throw new CrewError("usage_error", `cannot remove default tap \`${DEFAULT_TAP_NAME}\` without --force`);
    }
    const updated = { ...config, taps: config.taps.filter((t) => t.name !== name) };
    writeConfig(updated, ctx.home);
    rmrf(tapPath(name, ctx.home));
  }, ctx.home);
  return {
    exitCode: 0,
    human: [`removed tap ${name}`],
    json: { name },
  };
}

function tapList(ctx: CommandContext): CommandOutput {
  const config = readConfig(ctx.home);
  const rows = config.taps.map((t) => {
    const p = tapPath(t.name, ctx.home);
    let lastFetched: string | null = null;
    try {
      lastFetched = new Date(statSync(p).mtimeMs).toISOString();
    } catch {
      lastFetched = null;
    }
    return { name: t.name, url: t.url, last_fetched: lastFetched };
  });
  const human = rows.map((r) => `${r.name.padEnd(16)} ${r.url.padEnd(60)} last_fetched=${r.last_fetched ?? "-"}`);
  return { exitCode: 0, human, json: { taps: rows } };
}

function deriveTapName(url: string): string {
  let last = url;
  const hashIdx = last.indexOf("://");
  if (hashIdx >= 0) last = last.slice(hashIdx + 3);
  const parts = last.split(/[\/:]/).filter(Boolean);
  const tail = parts[parts.length - 1] ?? "tap";
  return tail.endsWith(".git") ? tail.slice(0, -4) : tail;
}
