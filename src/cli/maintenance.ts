/** Command-lifetime protection for ephemeral source bytes and store staging (§6, §14). */

import { realpathSync } from "node:fs";
import { join } from "node:path";
import type { CommandContext } from "../commands/types.ts";
import { paths } from "../core/paths.ts";
import { withLock } from "../util/advisory-lock.ts";
import { ensureDir } from "../util/fs.ts";
import type { CanonicalCommand } from "./aliases.ts";

const heldTargets = new Set<string>();

type MaintenancePolicy = "none" | "consumer" | "collector" | "cache" | "doctor";

const policies: Readonly<Record<CanonicalCommand, MaintenancePolicy>> = {
  install: "consumer",
  uninstall: "none",
  update: "collector",
  outdated: "consumer",
  list: "none",
  search: "consumer",
  info: "consumer",
  tap: "none", // Tap handlers coordinate after validation, excluding source-free previews (§14).
  agents: "none",
  autoupdate: "none",
  doctor: "doctor",
  cache: "cache",
  "self-update": "none",
  help: "none",
  version: "none",
};

/**
 * Acquire before state/clone locks and retain through source use and collection.
 * Internal helpers rely on their CLI caller holding this lock (§14).
 */
export function withCommandMaintenanceLock<T>(
  command: CanonicalCommand,
  ctx: CommandContext,
  fn: () => T,
): T {
  const policy = policies[command];
  if (policy === "none" || (policy === "cache" && ctx.positional[0] !== "clean")) return fn();
  const collector =
    !ctx.flags.dryRun &&
    (policy === "collector" ||
      policy === "cache" ||
      (policy === "doctor" && Boolean(ctx.flags.extras["repair"])));
  return withMaintenanceLock(ctx, collector, fn);
}

/** Tap acquisition/refresh starts its lease after argument validation and previews (§14). */
export function withSourceMaintenanceLock<T>(ctx: CommandContext, fn: () => T): T {
  return withMaintenanceLock(ctx, false, fn);
}

function withMaintenanceLock<T>(ctx: CommandContext, collector: boolean, fn: () => T): T {
  const locksDir = paths(ctx.home).locksDir;
  ensureDir(locksDir);
  const target = join(locksDir, "maintenance");
  const identity = join(realpathSync(locksDir), "maintenance");
  // §14: nested consumers share the lease; collectors cannot remove the outer run's bytes.
  if (heldTargets.has(identity) && !collector) return fn();
  return withLock(target, () => {
    heldTargets.add(identity);
    try {
      return fn();
    } finally {
      heldTargets.delete(identity);
    }
  });
}
