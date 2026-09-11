/**
 * Re-attribute state entries onto the incoming tap (§5.4, §16.5).
 *
 * When a skill is already installed from an auto tap and the user
 * installs the same location again through a tap that covers it — the
 * whole repo, say, instead of one subpath — the bytes don't move but
 * the bookkeeping does. The entry's `source` is rewritten to the
 * incoming tap, and the install-site markers follow, since markers are
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
 * the incoming tap too.
 */
export function rewriteReattributedMarkers(
  reattributions: readonly Reattribution[],
  taps: readonly TapConfig[],
  cwd: string,
): void {
  if (reattributions.length === 0) return;
  const tapsByName = new Map(taps.map((t) => [t.name, t]));
  const hasUserMove = reattributions.some((r) => r.scope === "user");
  // Only visit the roots a move actually names. Scanning every root
  // remembered in state would walk unrelated projects under the lock,
  // and a project-scope move must not touch a sibling project's marker
  // for the same skill (they are distinct installs).
  const projectRoots = new Set<string>();
  for (const r of reattributions) {
    if (r.scope === "project" && r.projectRoot) projectRoots.add(r.projectRoot);
  }
  for (const adapter of ALL_AGENTS) {
    if (hasUserMove) {
      for (const rec of listInstalledForAgent(adapter, "user", cwd)) {
        maybeRewrite(rec.installDir, rec.marker, reattributions, tapsByName, "user", null);
      }
    }
    for (const root of projectRoots) {
      for (const rec of listInstalledForAgent(adapter, "project", root)) {
        maybeRewrite(rec.installDir, rec.marker, reattributions, tapsByName, "project", root);
      }
    }
  }
}

function maybeRewrite(
  installDir: string,
  marker: Marker,
  reattributions: readonly Reattribution[],
  tapsByName: ReadonlyMap<string, TapConfig>,
  scope: "user" | "project",
  projectRoot: string | null,
): void {
  const move = reattributions.find(
    (r) =>
      r.name === marker.name &&
      r.scope === scope &&
      r.fromTap === marker.tap_name &&
      r.projectRoot === projectRoot,
  );
  if (!move) return;
  const tap = tapsByName.get(move.toTap);
  if (!tap) return;
  // `tap_discovery` describes the DESTINATION tap, so it can't be
  // inherited from the old marker: a move onto a non-recursive tap that
  // kept the old flag would mislead `doctor --repair`.
  const { tap_discovery: _dropped, ...rest } = marker;
  writeJson(join(installDir, ".crew.json"), {
    ...rest,
    tap_name: tap.name,
    tap_kind: tap.kind,
    tap_url: tap.url,
    tap_subpath: tap.subpath,
    tap_path: tap.path,
    ...(tap.discovery === "recursive" ? { tap_discovery: "recursive" } : {}),
    path: move.toPath,
  });
}
