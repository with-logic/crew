/**
 * Read-only integrity checks for `crew doctor` (§11.2).
 *
 * Each check is a pure function that takes the state snapshot (and,
 * where relevant, the marker index or active config) and returns zero
 * or more `Finding`s. The command entry point in `./index.ts` composes
 * them and optionally runs `./repair.ts` afterward.
 */

import { ALL_AGENTS } from "../../agents/registry.ts";
import { isAutoupdateLoaded } from "../../autoupdate/scheduler.ts";
import type { Config, StateEntry, StateFile } from "../../core/types.ts";
import { hashDirectory } from "../../hash/content.ts";
import { orphanStoreEntries } from "../../maintenance/gc.ts";
import { errnoReason, isGoneError } from "../../util/errno.ts";
import type { DoctorCode } from "./codes.ts";
import { type MarkerEntry, ownsInstall } from "./markers.ts";
import { lookAtEntryRoot } from "./project-root.ts";
import type { IsHiddenInstall } from "./unreadable.ts";

export interface Finding {
  readonly level: "ok" | "warn" | "error";
  readonly code: DoctorCode;
  readonly message: string;
}

/**
 * Check 1 & 2: state ↔ markers drift. With path sharing (§7.2), a
 * single marker's `adapters` list covers multiple adapter names, so we
 * check the list-overlap instead of a scalar equality. An install whose
 * marker crew couldn't read (`hidden`) is check 9's, not missing.
 */
export function checkStateMarkerDrift(
  stateEntries: readonly StateEntry[],
  markers: readonly MarkerEntry[],
  hidden: IsHiddenInstall,
): Finding[] {
  const findings: Finding[] = [];
  for (const entry of stateEntries) {
    for (const targetName of entry.agents) {
      if (hidden(entry, targetName)) continue;
      if (!markers.some((m) => ownsInstall(entry, m, [targetName]))) {
        findings.push({
          level: "error",
          code: "state_entry_without_marker",
          message: `state lists ${entry.name}@${entry.scope} on ${targetName} but no marker was found`,
        });
      }
    }
  }
  for (const m of markers) {
    if (!stateEntries.some((e) => ownsInstall(e, m))) {
      findings.push({
        level: "error",
        code: "marker_without_state",
        message: `marker at ${m.record.installDir} has no state entry`,
      });
    }
  }
  return findings;
}

/**
 * Check 3: content hash drift. An install folder crew can't read all of
 * is check 9's (§11.2), named by the path it couldn't read, and the
 * others are still checked. One that changes while it is hashed — a
 * concurrent update replacing it — is passed over: it isn't unreadable,
 * and the next run checks what replaced it.
 */
export function checkContentHashDrift(markers: readonly MarkerEntry[]): Finding[] {
  const findings: Finding[] = [];
  for (const m of markers) {
    const installDir = m.record.installDir;
    let actual: string;
    try {
      actual = hashDirectory(installDir);
    } catch (err) {
      if (isGoneError(err)) continue;
      const at = (err as NodeJS.ErrnoException).path ?? installDir;
      findings.push({
        level: "error",
        code: "unreadable_marker",
        message: `crew can't read \`${at}\` (${errnoReason(err)}), so it can't check \`${installDir}\` for local edits`,
      });
      continue;
    }
    if (actual !== m.record.marker.content_hash) {
      findings.push({
        level: "warn",
        code: "customized",
        message: `${m.record.installDir} has been customized`,
      });
    }
  }
  return findings;
}

/** Check 4: target detection drift. */
export function checkAgentDetection(
  stateEntries: readonly StateEntry[],
  config: Config,
): Finding[] {
  const findings: Finding[] = [];
  for (const adapter of ALL_AGENTS) {
    if (!(adapter.detect() || config.forced_agents.includes(adapter.name))) {
      const orphans = stateEntries.filter((e) => e.agents.includes(adapter.name));
      if (orphans.length > 0) {
        findings.push({
          level: "warn",
          code: "agent_missing",
          message: `agent ${adapter.name} is not detected but is still listed by ${orphans.length} state entry(ies)`,
        });
      }
    }
  }
  return findings;
}

/**
 * Check 5: orphan store entries.
 *
 * Detection delegates to `orphanStoreEntries`, the same predicate the
 * collector uses. They must not drift: a path-source entry has no
 * `resolved_sha` and is keyed by its short content hash instead, so a
 * detector that keys only on SHAs reports every such entry as orphaned
 * and then claims a repair addressed one the collector deliberately
 * kept. Sharing the predicate makes that disagreement impossible.
 */
export function checkOrphanStoreEntries(state: StateFile, home: string): Finding[] {
  const findings: Finding[] = [];
  for (const name of orphanStoreEntries(state, home)) {
    findings.push({
      level: "warn",
      code: "orphan_store_entry",
      message: `unreferenced store entry ${name}`,
    });
  }
  return findings;
}

/**
 * Check 8 (C-STATE-11): every project-scope entry's recorded
 * `project_root` directory still exists. A missing directory is a warn
 * — the local install files may still be on disk and removing them on
 * the user's behalf isn't doctor's job.
 */
export function checkProjectRoots(stateEntries: readonly StateEntry[]): Finding[] {
  const findings: Finding[] = [];
  for (const entry of stateEntries) {
    if (entry.scope !== "project") continue;
    // A path replaced by a regular file is as unusable as a missing
    // one — nothing can be read beneath it — and repair applies the
    // same test, so the two must not disagree. One crew can't look at
    // isn't missing: check 9 reports it.
    if (lookAtEntryRoot(entry).kind === "missing") {
      findings.push({
        level: "warn",
        code: "missing_project_root",
        message: `${entry.name}@project was installed under \`${entry.project_root}\` but that root is unusable or its directory no longer exists`,
      });
    }
  }
  return findings;
}

/** Check 7: autoupdate drift. */
export function checkAutoupdateDrift(config: Config): Finding[] {
  const findings: Finding[] = [];
  const loaded = isAutoupdateLoaded();
  if (config.autoupdate.enabled && !loaded) {
    findings.push({
      level: "warn",
      code: "autoupdate_not_loaded",
      message: "config says autoupdate enabled but the platform scheduler is not loaded",
    });
  }
  if (!config.autoupdate.enabled && loaded) {
    findings.push({
      level: "warn",
      code: "autoupdate_unexpectedly_loaded",
      message: "config says autoupdate disabled but the platform scheduler is still loaded",
    });
  }
  return findings;
}
