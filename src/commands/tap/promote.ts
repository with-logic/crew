/**
 * Promote an existing *auto* tap to *registered* and (optionally)
 * rename it.
 *
 * A rename is a cross-cutting operation: the tap row, the clone
 * directory (for git taps), every `state.installations[].source.tap`,
 * and every on-disk marker's `tap_name` all point at the old name.
 * Missing any of these leaves the system in a split state where
 * doctor --repair would reconstruct the old tap from markers.
 */

import { renameSync } from "node:fs";
import type { readConfig } from "../../config/load.ts";
import { writeConfig } from "../../config/load.ts";
import { tapPath } from "../../core/paths.ts";
import type { StateFile, TapConfig } from "../../core/types.ts";
import { readState, writeState } from "../../state/load.ts";
import { exists } from "../../util/fs.ts";
import { rewriteMarkerTapName } from "./rewrite-markers.ts";

export function promoteExistingTap(
  home: string,
  cwd: string,
  config: ReturnType<typeof readConfig>,
  sameTarget: TapConfig,
  targetKind: "git" | "path",
  explicitName: string | undefined,
): void {
  const renamedName = explicitName ?? sameTarget.name;
  const promoted: TapConfig = { ...sameTarget, registered: true, name: renamedName };
  const updated = {
    ...config,
    taps: config.taps.map((t) => (t.name === sameTarget.name ? promoted : t)),
  };
  if (renamedName !== sameTarget.name && targetKind === "git") {
    const oldPath = tapPath(sameTarget.name, home);
    const newPath = tapPath(renamedName, home);
    if (exists(oldPath)) renameSync(oldPath, newPath);
  }
  writeConfig(updated, home);
  if (renamedName === sameTarget.name) return;
  const state = readState(home);
  const rewritten: StateFile = {
    ...state,
    installations: state.installations.map((e) =>
      e.source.tap === sameTarget.name ? { ...e, source: { ...e.source, tap: renamedName } } : e,
    ),
  };
  writeState(rewritten, home);
  rewriteMarkerTapName(sameTarget.name, renamedName, rewritten.installations, cwd);
}
