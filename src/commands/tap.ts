/**
 * `crew tap {add,remove,list}` (§16).
 *
 * Add writes a new tap entry into config.yaml and performs the initial
 * clone. Remove deletes the local clone and removes the entry — with a
 * special rule for the default `core` tap which requires `--force`.
 * List prints every tap with its URL and last-fetched time (stat mtime
 * of the clone directory).
 *
 * Shorthand: `crew tap <git-url>` (no `add` keyword) is equivalent to
 * `crew tap add <git-url>`. We detect this by re-parsing the first
 * positional with `parseRef`: anything that comes back as a git source
 * is treated as an `add`. Plain words (subcommand names, typos) fall
 * through to subcommand dispatch.
 */

import { statSync } from "node:fs";
import { DEFAULT_TAP_NAME } from "../config/defaults.ts";
import { readConfig, writeConfig } from "../config/load.ts";
import { CrewError } from "../core/errors.ts";
import { tapPath } from "../core/paths.ts";
import { ensureRepo } from "../git/repo.ts";
import { parseRef } from "../refs/parse.ts";
import { withStateLock } from "../state/lock.ts";
import { rmrf } from "../util/fs.ts";
import type { CommandContext, CommandOutput } from "./types.ts";

export function tapCommand(ctx: CommandContext): CommandOutput {
  const sub = ctx.positional[0];
  const rest = ctx.positional.slice(1);
  if (sub === "add") return tapAdd(ctx, rest);
  if (sub === "remove") return tapRemove(ctx, rest);
  if (sub === "list") return tapList(ctx);
  // Shorthand: `crew tap <git-url> [<name>]` → `crew tap add <git-url> [<name>]`.
  // Only dispatch to add when the first positional parses as a git
  // source; plain words fall through to the usage error so typos of
  // `list`/`remove` don't silently try to add them as taps.
  if (sub && looksLikeGitSource(sub, ctx.cwd)) {
    return tapAdd(ctx, ctx.positional);
  }
  throw new CrewError(
    "usage_error",
    "`crew tap` takes one of: `<git-url> [<name>]`, `add <git-url> [<name>]`, `remove <name>`, or `list`",
  );
}

/** True if `ref` parses as a git source (URL, `gh:`, `@owner/repo`, etc.). */
function looksLikeGitSource(ref: string, cwd: string): boolean {
  try {
    return parseRef(ref, cwd).type === "git";
  } catch {
    return false;
  }
}

function tapAdd(ctx: CommandContext, args: readonly string[]): CommandOutput {
  if (args.length < 1)
    throw new CrewError(
      "usage_error",
      "`crew tap add` needs a git URL — e.g. `crew tap add https://github.com/acme/skills.git acme`",
    );
  const url = args[0]!;
  const explicitName = args[1];
  const name = explicitName ?? deriveTapName(url);
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new CrewError(
      "usage_error",
      `tap name \`${name}\` has invalid characters — use lowercase letters, digits, and hyphens only (starting with a letter)`,
      { name },
    );
  }
  let alreadyAtSameUrl = false;
  withStateLock(() => {
    const config = readConfig(ctx.home);
    const existing = config.taps.find((t) => t.name === name);
    if (existing) {
      if (existing.url === url) {
        // Same name, same URL — no-op. Makes `crew tap <url>` idempotent
        // so scripts don't have to special-case "already added."
        alreadyAtSameUrl = true;
        return;
      }
      throw new CrewError(
        "usage_error",
        `tap \`${name}\` is already configured at \`${existing.url}\` — to add this one under a different name, run \`crew tap add ${url} <your-name>\``,
        { name, existingUrl: existing.url, incomingUrl: url },
      );
    }
    const updated = { ...config, taps: [...config.taps, { name, url }] };
    writeConfig(updated, ctx.home);
    ensureRepo(url, tapPath(name, ctx.home));
  }, ctx.home);
  if (alreadyAtSameUrl) {
    return {
      exitCode: 0,
      human: [`tap ${name} is already configured at ${url} — nothing to do`],
      json: { name, url, already: true },
    };
  }
  return {
    exitCode: 0,
    human: [`added tap ${name} → ${url}`],
    json: { name, url },
  };
}

function tapRemove(ctx: CommandContext, args: readonly string[]): CommandOutput {
  if (args.length !== 1)
    throw new CrewError(
      "usage_error",
      "`crew tap remove` needs exactly one tap name — see `crew tap list`",
    );
  const name = args[0]!;
  withStateLock(() => {
    const config = readConfig(ctx.home);
    if (!config.taps.some((t) => t.name === name)) {
      throw new CrewError(
        "usage_error",
        `no tap named \`${name}\` is configured — run \`crew tap list\` to see what's there`,
        { name },
      );
    }
    if (name === DEFAULT_TAP_NAME && !ctx.flags.force)
      throw new CrewError(
        "usage_error",
        `\`${DEFAULT_TAP_NAME}\` is the default tap — pass \`--force\` if you're sure you want to remove it`,
      );
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
  const human = rows.map(
    (r) => `${r.name.padEnd(16)} ${r.url.padEnd(60)} last_fetched=${r.last_fetched ?? "-"}`,
  );
  return { exitCode: 0, human, json: { taps: rows } };
}

function deriveTapName(url: string): string {
  let last = url;
  const hashIdx = last.indexOf("://");
  if (hashIdx >= 0) {
    last = last.slice(hashIdx + 3);
  }
  const parts = last.split(/[/:]/).filter(Boolean);
  const tail = parts[parts.length - 1] ?? "tap";
  return tail.endsWith(".git") ? tail.slice(0, -4) : tail;
}
