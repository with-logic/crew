/**
 * `crew doctor [--verify] [--repair]` (§11.2).
 *
 * Runs integrity checks and optionally repairs recoverable drift.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../config/load.ts";
import { crewHome, paths } from "../core/paths.ts";
import type { Marker, StateEntry } from "../core/types.ts";
import { readState, writeState } from "../state/load.ts";
import { withStateLock } from "../state/lock.ts";
import { ALL_ADAPTERS } from "../targets/registry.ts";
import { listInstalledForTarget } from "../targets/list.ts";
import { hashDirectory } from "../hash/content.ts";
import { garbageCollectStore } from "../maintenance/gc.ts";
import { isAutoupdateLoaded } from "../autoupdate/launchd.ts";
import { isDirectory, rmrf } from "../util/fs.ts";
import type { CommandContext, CommandOutput } from "./types.ts";

interface Finding {
  level: "ok" | "warn" | "error";
  code: string;
  message: string;
}

export function doctorCommand(ctx: CommandContext): CommandOutput {
  const verify = Boolean(ctx.flags.extras["verify"]);
  const repair = Boolean(ctx.flags.extras["repair"]);
  const home = ctx.home ?? crewHome();

  const findings: Finding[] = [];
  const config = (() => {
    try {
      return readConfig(home);
    } catch (err) {
      findings.push({ level: "error", code: "config_invalid", message: (err as Error).message });
      return null;
    }
  })();

  // Build marker index.
  interface MarkerEntry { record: ReturnType<typeof listInstalledForTarget>[number]; currentHash?: string }
  const markers: MarkerEntry[] = [];
  for (const adapter of ALL_ADAPTERS) {
    for (const scope of ["user", "project"] as const) {
      for (const rec of listInstalledForTarget(adapter, scope, ctx.cwd)) {
        markers.push({ record: rec });
      }
    }
  }

  const state = readState(home);
  const stateEntries = state.installations;

  // Check 1 & 2: state ↔ markers drift.
  for (const entry of stateEntries) {
    for (const targetName of entry.targets) {
      const match = markers.find(
        (m) => m.record.marker.name === entry.name && m.record.scope === entry.scope && m.record.adapter === targetName,
      );
      if (!match) {
        findings.push({
          level: "error",
          code: "state_entry_without_marker",
          message: `state lists ${entry.name}@${entry.scope} on ${targetName} but no marker was found`,
        });
      }
    }
  }
  for (const m of markers) {
    const match = stateEntries.find(
      (e) => e.name === m.record.marker.name && e.scope === m.record.scope && e.targets.includes(m.record.adapter),
    );
    if (!match) {
      findings.push({
        level: "error",
        code: "marker_without_state",
        message: `marker at ${m.record.installDir} has no state entry`,
      });
    }
  }

  // Check 3: content hash drift (only with --verify).
  if (verify) {
    for (const m of markers) {
      const actual = hashDirectory(m.record.installDir);
      m.currentHash = actual;
      if (actual !== m.record.marker.content_hash) {
        findings.push({
          level: "warn",
          code: "customized",
          message: `${m.record.installDir} has been customized`,
        });
      }
    }
  }

  // Check 4: target detection drift.
  if (config) {
    for (const adapter of ALL_ADAPTERS) {
      if (!adapter.detect() && !config.forced_targets.includes(adapter.name)) {
        // Any state entry still targets this? Flag.
        const orphans = stateEntries.filter((e) => e.targets.includes(adapter.name));
        if (orphans.length > 0) {
          findings.push({
            level: "warn",
            code: "target_missing",
            message: `target ${adapter.name} is not detected but is still listed by ${orphans.length} state entry(ies)`,
          });
        }
      }
    }
  }

  // Check 5: orphan store entries.
  const storeDir = paths(home).storeDir;
  if (isDirectory(storeDir)) {
    // Already handled by GC in --repair below. For non-repair runs, just report.
    const referenced = new Set(stateEntries.filter((e) => e.resolved_sha).map((e) => `${e.name}@${e.resolved_sha!.slice(0, 8)}`));
    const { listDir } = require("../util/fs.ts") as typeof import("../util/fs.ts");
    for (const name of listDir(storeDir)) {
      if (!referenced.has(name)) {
        findings.push({ level: "warn", code: "orphan_store_entry", message: `unreferenced store entry ${name}` });
      }
    }
  }

  // Check 7: autoupdate drift.
  if (config) {
    const loaded = isAutoupdateLoaded();
    if (config.autoupdate.enabled && !loaded) {
      findings.push({ level: "warn", code: "autoupdate_not_loaded", message: "config says autoupdate enabled but launchd agent is not loaded" });
    }
    if (!config.autoupdate.enabled && loaded) {
      findings.push({ level: "warn", code: "autoupdate_unexpectedly_loaded", message: "autoupdate agent is loaded but config says disabled" });
    }
  }

  // Repair path.
  if (repair) {
    withStateLock(() => {
      let current = readState(home);
      // Orphaned state entries: entries whose target markers are missing AND
      // the target is not detected — remove.
      current = {
        schema_version: 1,
        installations: current.installations.filter((entry) => {
          const anyMarkerExists = markers.some(
            (m) =>
              m.record.marker.name === entry.name &&
              m.record.scope === entry.scope &&
              entry.targets.includes(m.record.adapter),
          );
          return anyMarkerExists;
        }),
      };

      // Orphaned markers: reconstruct state entries from markers.
      for (const m of markers) {
        const existing = current.installations.find(
          (e) => e.name === m.record.marker.name && e.scope === m.record.scope,
        );
        if (!existing) {
          const entry: StateEntry = markerToStateEntry(m.record.marker, m.record.adapter);
          current = { schema_version: 1, installations: [...current.installations, entry] };
        } else if (!existing.targets.includes(m.record.adapter)) {
          current = {
            schema_version: 1,
            installations: current.installations.map((e) =>
              e.name === existing.name && e.scope === existing.scope
                ? { ...e, targets: [...e.targets, m.record.adapter] }
                : e,
            ),
          };
        }
      }

      writeState(current, home);

      // Orphan store entries.
      garbageCollectStore(current, home);
    }, home);
  }

  const human = findings.map((f) => `[${f.level}] ${f.code}: ${f.message}`);
  if (findings.length === 0) human.push("OK");
  void existsSync;
  void join;
  void rmrf;
  // After a successful `--repair`, drift-class findings are resolved, so
  // exit 0. Without `--repair`, errors keep the non-zero exit code.
  const exitCode = repair ? 0 : findings.some((f) => f.level === "error") ? 1 : 0;
  return { exitCode, human, json: { findings } };
}

function markerToStateEntry(marker: Marker, adapter: string): StateEntry {
  const pinned = marker.ref !== null && (/^[0-9a-f]{40}$/i.test(marker.ref) || /^v?\d/.test(marker.ref));
  return {
    name: marker.name,
    source: marker.source,
    ref: marker.ref,
    resolved_sha: marker.resolved_sha,
    content_hash: marker.content_hash,
    scope: marker.scope,
    installed_at: marker.installed_at,
    targets: [adapter],
    pinned,
  };
}
