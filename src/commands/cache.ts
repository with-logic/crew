/**
 * `crew cache clean` — remove ephemeral caches and GC the store (§5.1).
 *
 * Reports how much disk space was freed and how many store entries
 * went with it, in a single friendly line. If there was nothing to
 * clean, says so.
 */

import { statSync } from "node:fs";
import { CrewError } from "../core/errors.ts";
import { paths } from "../core/paths.ts";
import { garbageCollectStore } from "../maintenance/gc.ts";
import { readState } from "../state/load.ts";
import { withStateLock } from "../state/lock.ts";
import { plural } from "../util/format.ts";
import { rmrf, walk } from "../util/fs.ts";
import type { Styler } from "../util/term.ts";
import { showCommandHelp } from "./help/index.ts";
import type { CommandContext, CommandOutput } from "./types.ts";

export function cacheCommand(ctx: CommandContext): CommandOutput {
  const sub = ctx.positional[0];
  if (sub !== "clean") {
    // Bare `crew cache` shows the help page. An unknown subcommand is
    // a user typo — error out with a hint.
    if (!sub) return showCommandHelp("cache");
    throw new CrewError(
      "usage_error",
      `\`${sub}\` is not a \`crew cache\` command.\n\nRun \`crew help cache\` to see the cache commands.`,
      { sub },
    );
  }
  let removedStore: string[] = [];
  let freedBytes = 0;
  const p = paths(ctx.home);
  withStateLock(() => {
    const state = readState(ctx.home);
    // Measure the cache and store BEFORE we touch them so the freed-
    // byte count reflects what actually went away.
    freedBytes = dirSize(p.cacheDir);
    rmrf(p.cacheDir);
    const storeBefore = dirSize(p.storeDir);
    removedStore = garbageCollectStore(state, ctx.home);
    const storeAfter = dirSize(p.storeDir);
    freedBytes += Math.max(0, storeBefore - storeAfter);
  }, ctx.home);
  return {
    exitCode: 0,
    human: [renderHuman(freedBytes, removedStore.length, ctx.style)],
    json: { removed_store: removedStore, freed_bytes: freedBytes },
  };
}

function renderHuman(freedBytes: number, removedEntries: number, style: Styler): string {
  if (freedBytes === 0 && removedEntries === 0) {
    return `${style.symbol("muted")} ${style.dim("Nothing to clean — cache was already empty.")}`;
  }
  const parts: string[] = [];
  if (freedBytes > 0) parts.push(`${formatBytes(freedBytes)} freed`);
  if (removedEntries > 0) parts.push(plural(removedEntries, "orphan", "orphans"));
  return `${style.symbol("ok")} ${style.bold("Cache cleaned")} ${style.dim(`(${parts.join(" · ")})`)}`;
}

function dirSize(dir: string): number {
  let total = 0;
  for (const entry of walk(dir)) {
    if (entry.isFile) {
      try {
        total += statSync(entry.absPath).size;
      } catch {
        // File disappeared between walk and stat; skip.
      }
    }
  }
  return total;
}

/** Format a byte count as "42 KB", "1.2 MB", etc. Binary units (1024). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  const gb = mb / 1024;
  return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)} GB`;
}
