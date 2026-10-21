/** Command-lifetime protection for ephemeral source bytes and store staging (§6, §14). */

import { realpathSync } from "node:fs";
import { join } from "node:path";
import type { CommandContext } from "../commands/types.ts";
import { paths } from "../core/paths.ts";
import { withLock } from "../util/advisory-lock.ts";
import { ensureDir } from "../util/fs.ts";

const heldTargets = new Set<string>();

/**
 * Acquire before state/clone locks and retain through source use and collection.
 * Internal helpers rely on their CLI caller holding this lock (§14).
 */
export function withCommandMaintenanceLock<T>(
  command: string,
  ctx: CommandContext,
  fn: () => T,
): T {
  if (!usesMaintenanceTrees(command, ctx)) return fn();
  const locksDir = paths(ctx.home).locksDir;
  ensureDir(locksDir);
  const target = join(locksDir, "maintenance");
  const identity = join(realpathSync(locksDir), "maintenance");
  // §14: nested consumers share the lease; collectors cannot remove the outer run's bytes.
  if (heldTargets.has(identity) && !collectsMaintenanceTrees(command, ctx)) return fn();
  return withLock(target, () => {
    heldTargets.add(identity);
    try {
      return fn();
    } finally {
      heldTargets.delete(identity);
    }
  });
}

function usesMaintenanceTrees(command: string, ctx: CommandContext): boolean {
  if (["install", "update", "outdated", "info", "search", "doctor"].includes(command)) return true;
  if (command === "cache") return ctx.positional[0] === "clean";
  if (command === "tap") {
    const sub = ctx.positional[0];
    // Removal uses only durable clones, already protected by clone locks.
    return sub !== undefined && sub !== "list" && sub !== "remove";
  }
  return false;
}

function collectsMaintenanceTrees(command: string, ctx: CommandContext): boolean {
  if (ctx.flags.dryRun) return false;
  return (
    command === "update" ||
    command === "cache" ||
    (command === "doctor" && Boolean(ctx.flags.extras["repair"]))
  );
}
