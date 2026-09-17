/**
 * `crew tap {add,remove,list,update}` (§16).
 *
 * This file is the dispatcher for the `tap` subcommand tree. The
 * actual add/remove/list/update logic lives in sibling modules to
 * keep each file under the project's 200-line cap and readable in
 * isolation.
 *
 * Shorthand: `crew tap <git-url-or-path> [<name>]` (no `add` keyword)
 * is equivalent to `crew tap add <…> [<name>]`. Detected by
 * re-parsing the first positional with `parseRef`.
 */

import { statSync } from "node:fs";
import { DEFAULT_TAP_NAME } from "../../config/defaults.ts";
import { readConfig, writeConfig } from "../../config/load.ts";
import { CrewError } from "../../core/errors.ts";
import { tapPath } from "../../core/paths.ts";
import type { TapConfig } from "../../core/types.ts";
import { parseRef } from "../../refs/parse.ts";
import { withTapLocks } from "../../sources/tap-lock.ts";
import { withStateLock } from "../../state/lock.ts";
import { rmrf } from "../../util/fs.ts";
import { showCommandHelp } from "../help/index.ts";
import type { CommandContext, CommandOutput } from "../types.ts";
import { tapAdd } from "./add.ts";
import { planRefresh, refreshTaps, type TapRefreshRow } from "./refresh.ts";
import {
  renderTapList,
  renderTapRemove,
  renderTapUpdate,
  type TapListRow,
} from "./render/index.ts";
import { displayTarget } from "./target.ts";

export function tapCommand(ctx: CommandContext): CommandOutput {
  const sub = ctx.positional[0];
  const rest = ctx.positional.slice(1);
  if (sub === "add") return tapAdd(ctx, rest);
  if (sub === "remove") return tapRemove(ctx, rest);
  if (sub === "list") return tapList(ctx, rest);
  if (sub === "update") return tapUpdate(ctx, rest);
  // Shorthand: `crew tap <ref> [<name>]` → `crew tap add <ref> [<name>]`.
  // Only dispatch when the first positional parses as a git source or
  // a path; bare words fall through to the error/help below.
  if (sub && looksLikeTapSource(sub, ctx.cwd)) {
    return tapAdd(ctx, ctx.positional);
  }
  // Bare `crew tap` with no arguments shows the help page — the user
  // is asking "what can I do here?". An unknown subcommand is a real
  // mistake (typo) and gets a short usage_error with a pointer to
  // help.
  if (!sub) return showCommandHelp("tap");
  throw new CrewError(
    "usage_error",
    `\`${sub}\` is not a \`crew tap\` command.`,
    { sub },
    "Run `crew help tap` to see the tap commands.",
  );
}

/** True if `ref` parses as a git or path source (anything but a tap-name reference). */
function looksLikeTapSource(ref: string, cwd: string): boolean {
  try {
    const t = parseRef(ref, cwd).type;
    return t === "git" || t === "path";
  } catch {
    return false;
  }
}

function tapRemove(ctx: CommandContext, args: readonly string[]): CommandOutput {
  rejectRecursiveFlag(ctx);
  if (args.length !== 1)
    throw new CrewError(
      "usage_error",
      "`crew tap remove` needs exactly one tap name — see `crew tap list`",
    );
  const name = args[0]!;
  const dryRun = ctx.flags.dryRun;
  let kind: "git" | "path" = "git";
  const remove = () => {
    const config = readConfig(ctx.home);
    const tap = tapToRemove(config.taps, name, ctx.flags.force);
    kind = tap.kind;
    if (dryRun) return; // §16.3: same lookup + guard, nothing written.
    const updated = { ...config, taps: config.taps.filter((t) => t.name !== name) };
    writeConfig(updated, ctx.home);
    if (tap.kind === "git") rmrf(tapPath(name, ctx.home));
    // Path taps don't own the directory; never delete it.
  };
  if (dryRun) remove();
  else withStateLock(remove, ctx.home);
  return {
    exitCode: 0,
    human: renderTapRemove(name, kind, dryRun, ctx.style),
    json: { name, ...(dryRun ? { dry_run: true } : {}) },
  };
}

/** Look up the tap to remove; unknown names and the unforced default tap are usage errors. */
function tapToRemove(taps: readonly TapConfig[], name: string, force: boolean): TapConfig {
  const tap = taps.find((t) => t.name === name);
  if (!tap) {
    throw new CrewError(
      "usage_error",
      `\`${name}\` was not found in your list of taps.`,
      { name },
      "This may have been a typo. View your configured taps with `crew tap list`.",
    );
  }
  if (name === DEFAULT_TAP_NAME && !force)
    throw new CrewError(
      "usage_error",
      `\`${DEFAULT_TAP_NAME}\` is the default tap — pass \`--force\` if you're sure you want to remove it`,
    );
  return tap;
}

/**
 * `crew tap update [<name>]` — fetch + fast-forward one or every git tap.
 * Path taps are silently skipped (no upstream to fetch). `--dry-run`
 * lists what would be fetched without touching the network.
 *
 * Holds each selected tap's clone lock while fetching: fast-forwarding a
 * working tree concurrently with an install that has already resolved a
 * SHA from it would let that install stage a different commit's bytes
 * than the one it records (§10.1 step 1, §14).
 */
function tapUpdate(ctx: CommandContext, args: readonly string[]): CommandOutput {
  rejectRecursiveFlag(ctx);
  const config = readConfig(ctx.home);
  const selected: readonly TapConfig[] =
    args.length === 0 ? config.taps : tapsMatching(config.taps, args);
  const dryRun = ctx.flags.dryRun;
  const rows: TapRefreshRow[] = dryRun
    ? planRefresh(selected)
    : withTapLocks(selected, ctx.home, () => refreshTaps(selected, ctx.home));
  const anyFailed = rows.some((r) => r.kind === "failed");
  return {
    exitCode: anyFailed ? 1 : 0,
    human: renderTapUpdate(rows, dryRun, ctx.style),
    json: { rows, ...(dryRun ? { dry_run: true } : {}) },
  };
}

/** Resolve one-or-more tap names from positional args; unknowns are usage errors. */
function tapsMatching(all: readonly TapConfig[], names: readonly string[]): TapConfig[] {
  const out: TapConfig[] = [];
  for (const n of names) {
    const tap = all.find((t) => t.name === n);
    if (!tap) {
      throw new CrewError(
        "usage_error",
        `\`${n}\` was not found in your list of taps.`,
        { name: n },
        "This may have been a typo. View your configured taps with `crew tap list`.",
      );
    }
    out.push(tap);
  }
  return out;
}

function tapList(ctx: CommandContext, args: readonly string[]): CommandOutput {
  rejectRecursiveFlag(ctx);
  if (args.length !== 0)
    throw new CrewError(
      "usage_error",
      "`crew tap list` takes no arguments — run `crew help tap` to see what's available",
    );
  const config = readConfig(ctx.home);
  const rows: TapListRow[] = config.taps.map((t) => {
    let lastFetched: string | null = null;
    if (t.kind === "git") {
      const p = tapPath(t.name, ctx.home);
      try {
        lastFetched = new Date(statSync(p).mtimeMs).toISOString();
      } catch {
        lastFetched = null;
      }
    }
    return {
      name: t.name,
      kind: t.kind,
      registered: t.registered,
      discovery: t.discovery ?? "standard",
      target: displayTarget(t),
      last_fetched: lastFetched,
    };
  });
  return { exitCode: 0, human: renderTapList(rows, ctx.style), json: { taps: rows } };
}

function rejectRecursiveFlag(ctx: CommandContext): void {
  if (!ctx.flags.extras["recursive"]) return;
  throw new CrewError("usage_error", "`--recursive` only applies to `crew tap add`");
}
