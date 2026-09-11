/**
 * Re-attribute state entries onto a broader tap (§5.4, §16.5).
 *
 * When a skill is already installed from an auto tap and the user
 * installs the same location again through a tap that covers it — the
 * whole repo, say, instead of one subpath — the bytes don't move but
 * the bookkeeping does. The entry's `source` is rewritten to the
 * broader tap, and the install-site markers follow, since markers are
 * authoritative for `doctor --repair` (§11.1).
 */

import { join } from "node:path";
import { listInstalledForAgent } from "../agents/list.ts";
import { ALL_AGENTS } from "../agents/registry.ts";
import type { Marker, StateFile, TapConfig } from "../core/types.ts";
import { writeJson } from "../util/json.ts";
import type { Reattribution } from "./duplicate-rules.ts";

/** Apply every re-attribution to `state`, returning the updated file. */
export function applyReattributions(
  state: StateFile,
  reattributions: readonly Reattribution[],
): StateFile {
  if (reattributions.length === 0) return state;
  return {
    schema_version: 1,
    installations: state.installations.map((entry) => {
      const move = reattributions.find(
        (r) =>
          r.name === entry.name &&
          r.scope === entry.scope &&
          r.projectRoot === (entry.project_root ?? null),
      );
      if (!move) return entry;
      return { ...entry, source: { tap: move.toTap, path: move.toPath } };
    }),
  };
}

/**
 * Rewrite the tap descriptor of every marker belonging to a
 * re-attributed skill. Unlike `rewriteTapMarkers`, which moves every
 * marker of a renamed tap, this targets one skill at a time — the old
 * tap may still own other skills that are staying put. The whole
 * descriptor moves (name, kind, url, subpath, path, discovery) plus the
 * skill's location inside the new tap, so a marker-only rebuild lands on
 * the broader tap too.
 */
export function rewriteReattributedMarkers(
  reattributions: readonly Reattribution[],
  state: StateFile,
  taps: readonly TapConfig[],
  cwd: string,
): void {
  if (reattributions.length === 0) return;
  const projectRoots = new Set<string>([cwd]);
  for (const e of state.installations) {
    if (e.scope === "project" && e.project_root) projectRoots.add(e.project_root);
  }
  for (const adapter of ALL_AGENTS) {
    for (const rec of listInstalledForAgent(adapter, "user", cwd)) {
      maybeRewrite(rec.installDir, rec.marker, reattributions, taps, "user");
    }
    for (const root of projectRoots) {
      for (const rec of listInstalledForAgent(adapter, "project", root)) {
        maybeRewrite(rec.installDir, rec.marker, reattributions, taps, "project");
      }
    }
  }
}

function maybeRewrite(
  installDir: string,
  marker: Marker,
  reattributions: readonly Reattribution[],
  taps: readonly TapConfig[],
  scope: "user" | "project",
): void {
  const move = reattributions.find(
    (r) => r.name === marker.name && r.scope === scope && r.fromTap === marker.tap_name,
  );
  if (!move) return;
  const tap = taps.find((t) => t.name === move.toTap);
  if (!tap) return;
  writeJson(join(installDir, ".crew.json"), {
    ...marker,
    tap_name: tap.name,
    tap_kind: tap.kind,
    tap_url: tap.url,
    tap_subpath: tap.subpath,
    tap_path: tap.path,
    ...(tap.discovery === "recursive" ? { tap_discovery: "recursive" } : {}),
    path: move.toPath,
  });
}
