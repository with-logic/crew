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
import { readConfig } from "../../config/load.ts";
import { CrewError } from "../../core/errors.ts";
import { tapClonePath } from "../../core/repo-path.ts";
import type { TapConfig } from "../../core/types.ts";
import { parseRef } from "../../refs/parse.ts";
import { showCommandHelp } from "../help/index.ts";
import type { CommandContext, CommandOutput } from "../types.ts";
import { tapAdd } from "./add.ts";
import { planRefresh, refreshTaps, type TapRefreshRow } from "./refresh.ts";
import { tapRemove } from "./remove/index.ts";
import { renderTapList, renderTapUpdate, type TapListRow } from "./render/index.ts";
import { displayTarget } from "./target.ts";

export function tapCommand(ctx: CommandContext): CommandOutput {
  const sub = ctx.positional[0];
  const rest = ctx.positional.slice(1);
  if (sub === "remove") return tapRemove(ctx, rest);
  rejectUninstallFlag(ctx);
  if (sub === "add") return tapAdd(ctx, rest);
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

/**
 * `crew tap update [<name>]` — fetch + fast-forward one or every git tap.
 * Path taps are silently skipped (no upstream to fetch). `--dry-run`
 * lists what would be fetched without touching the network.
 */
function tapUpdate(ctx: CommandContext, args: readonly string[]): CommandOutput {
  rejectRecursiveFlag(ctx);
  const config = readConfig(ctx.home);
  const selected: readonly TapConfig[] =
    args.length === 0 ? config.taps : tapsMatching(config.taps, args);
  const dryRun = ctx.flags.dryRun;
  const rows: TapRefreshRow[] = dryRun ? planRefresh(selected) : refreshTaps(selected, ctx.home);
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
      const p = tapClonePath(t, ctx.home);
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

function rejectUninstallFlag(ctx: CommandContext): void {
  if (!ctx.flags.extras["uninstall"]) return;
  throw new CrewError("usage_error", "`--uninstall` only applies to `crew tap remove`");
}
