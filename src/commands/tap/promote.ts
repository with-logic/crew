/**
 * Promote an existing *auto* tap to *registered* and (optionally)
 * rename it.
 *
 * A rename is a cross-cutting operation: the tap row, every
 * `state.installations[].source.tap`, and every on-disk marker's
 * `tap_name` all point at the old name. Missing any of these leaves the
 * system in a split state where doctor --repair would reconstruct the
 * old tap from markers.
 *
 * The clone is not among them: it is keyed by repository URL (§6), which
 * a rename doesn't change.
 */

import type { readConfig } from "../../config/load.ts";
import { writeConfig } from "../../config/load.ts";
import type { StateFile, TapConfig } from "../../core/types.ts";
import { rewriteTapMarkers } from "../../install/rewrite-tap-markers.ts";
import { readState, writeState } from "../../state/load.ts";

export function promoteExistingTap(
  home: string,
  cwd: string,
  config: ReturnType<typeof readConfig>,
  sameTarget: TapConfig,
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
