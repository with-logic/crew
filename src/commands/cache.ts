/**
 * `crew cache clean` — remove ephemeral caches and GC the store (§5.1).
 */

import { CrewError } from "../core/errors.ts";
import { paths } from "../core/paths.ts";
import { garbageCollectStore } from "../maintenance/gc.ts";
import { readState } from "../state/load.ts";
import { withStateLock } from "../state/lock.ts";
import { rmrf } from "../util/fs.ts";
import type { CommandContext, CommandOutput } from "./types.ts";

export function cacheCommand(ctx: CommandContext): CommandOutput {
  const sub = ctx.positional[0];
  if (sub !== "clean") {
    throw new CrewError("usage_error", "`crew cache` currently has one subcommand: `clean`");
  }
  let removedStore: string[] = [];
  withStateLock(() => {
    const state = readState(ctx.home);
    rmrf(paths(ctx.home).cacheDir);
    removedStore = garbageCollectStore(state, ctx.home);
  }, ctx.home);
  return {
    exitCode: 0,
    human: [`cleaned cache; removed ${removedStore.length} store entries`],
    json: { removed_store: removedStore },
  };
}
