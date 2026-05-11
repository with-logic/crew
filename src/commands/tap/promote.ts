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
import { rewriteTapMarkers } from "./rewrite-markers.ts";

export function promoteExistingTap(
  home: string,
  cwd: string,
  config: ReturnType<typeof readConfig>,
  sameTarget: TapConfig,
  targetKind: "git" | "path",
  explicitName: string | undefined,
  recursive: boolean,
): void {
  const renamedName = explicitName ?? sameTarget.name;
  const promoted: TapConfig = {
    ...sameTarget,
    registered: true,
    name: renamedName,
    ...(recursive ? { discovery: "recursive" } : {}),
  };
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
  const state = readState(home);
  const rewritten: StateFile = {
    ...state,
    installations: state.installations.map((e) =>
      e.source.tap === sameTarget.name ? { ...e, source: { ...e.source, tap: renamedName } } : e,
    ),
  };
  if (renamedName !== sameTarget.name) writeState(rewritten, home);
  rewriteTapMarkers(
    {
      oldName: sameTarget.name,
      newName: renamedName,
      ...(recursive ? { discovery: "recursive" } : {}),
    },
    rewritten.installations,
    cwd,
  );
}
