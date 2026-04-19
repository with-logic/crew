/**
 * Drift reconciliation for `crew doctor --repair` (§11.2).
 *
 * Rebuilds state from the authoritative markers (§11.1 — state is a
 * convenience index; markers are ground truth), then garbage-collects
 * store entries that no one references. Never touches user-customized
 * skills or paths outside `~/.crew/` and each skill's install directory.
 */

import type { StateEntry } from "../../core/types.ts";
import { garbageCollectStore } from "../../maintenance/gc.ts";
import { readState, writeState } from "../../state/load.ts";
import { withStateLock } from "../../state/lock.ts";
import type { MarkerEntry } from "./markers.ts";

/** Runs inside a state lock; caller just invokes and forgets. */
export function repairState(markers: readonly MarkerEntry[], home: string): void {
  withStateLock(() => {
    let current = readState(home);
    // Orphaned state entries: entries whose target markers are missing
    // AND the target is not detected — remove.
    const keep: StateEntry[] = [];
    for (const entry of current.installations) {
      let anyMarkerExists = false;
      for (const m of markers) {
        if (
          m.record.marker.name === entry.name &&
          m.record.scope === entry.scope &&
          entry.targets.includes(m.record.adapter)
        ) {
          anyMarkerExists = true;
          break;
        }
      }
      if (anyMarkerExists) keep.push(entry);
    }
    current = { schema_version: 1, installations: keep };

    // Orphaned markers: reconstruct state entries from markers.
    for (const m of markers) {
      const marker = m.record.marker;
      const existing = current.installations.find(
        (e) => e.name === marker.name && e.scope === m.record.scope,
      );
      if (!existing) {
        const pinned =
          marker.ref !== null && (/^[0-9a-f]{40}$/i.test(marker.ref) || /^v?\d/.test(marker.ref));
        const entry: StateEntry = {
          name: marker.name,
          source: marker.source,
          ref: marker.ref,
          resolved_sha: marker.resolved_sha,
          content_hash: marker.content_hash,
          scope: marker.scope,
          installed_at: marker.installed_at,
          targets: [m.record.adapter],
          pinned,
          // Reconstructed entries are treated as explicit — we can't
          // infer dependency status from markers alone, so we pick the
          // safe default that keeps the skill around.
          explicit: true,
          ...(marker.scope === "project" && m.projectRoot ? { project_root: m.projectRoot } : {}),
          required_by: [],
        };
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
