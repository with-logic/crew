/**
 * Install a newly-detected tap child (§10.1.1 step 2).
 *
 * Stages the child into the store, runs the install algorithm for
 * every target the rest of the tap was installed into, and returns a
 * fresh state entry on success. Per-target failures are non-fatal.
 */

import type { Scope, StateEntry, TapConfig } from "../core/types.ts";
import { stageIntoStore } from "../sources/store.ts";
import { baseFor, type TargetAdapter } from "../targets/adapter.ts";
import { installSkillIntoTarget } from "../targets/install.ts";
import { adapterByName } from "../targets/registry.ts";
import { nowIso } from "../util/time.ts";

export function installNewTapChild(
  args: {
    readonly skillDir: string;
    readonly skillName: string;
    readonly tapRelativePath: string;
    readonly scope: Scope;
    readonly tap: TapConfig;
    readonly targets: readonly string[];
    readonly resolvedSha: string | null;
    readonly projectRoot: string | null;
  },
  force: boolean,
  home: string,
  fallbackCwd: string,
): StateEntry | null {
  const childCwd = args.scope === "project" ? (args.projectRoot ?? fallbackCwd) : fallbackCwd;
  const staged = stageIntoStore(args.skillDir, args.skillName, args.resolvedSha, home);
  const successfulTargets: string[] = [];
  // Group adapters by resolved install path (path sharing, §7.2) so
  // shared-path targets install once but both get marked successful.
  const groups = new Map<string, TargetAdapter[]>();
  for (const targetName of args.targets) {
    const adapter = adapterByName(targetName);
    if (!adapter) continue;
    const base = baseFor(adapter, args.scope, childCwd);
    if (base === "") continue;
    const dest = `${base}/${args.skillName}`;
    const existing = groups.get(dest);
    if (existing) existing.push(adapter);
    else groups.set(dest, [adapter]);
  }
  for (const group of groups.values()) {
    try {
      installSkillIntoTarget({
        adapters: group,
        scope: args.scope,
        cwd: childCwd,
        storePath: staged.storePath,
        skillName: args.skillName,
        tap: args.tap,
        tapRelativePath: args.tapRelativePath,
        ref: null,
        resolvedSha: args.resolvedSha,
        contentHash: staged.contentHash,
        force,
      });
      for (const a of group) successfulTargets.push(a.name);
    } catch {
      // Per-group failure is non-fatal.
    }
  }
  if (successfulTargets.length === 0) return null;
  return {
    name: args.skillName,
    source: { tap: args.tap.name, path: args.tapRelativePath },
    ref: null,
    resolved_sha: args.resolvedSha,
    content_hash: staged.contentHash,
    scope: args.scope,
    installed_at: nowIso(),
    targets: successfulTargets,
    pinned: false,
    explicit: true,
    // Tap re-expansion only fires for whole-tap groups, so a child
    // added this way is also whole-tap-tracked — future siblings
    // should follow too.
    tracks_tap: true,
    required_by: [],
    ...(args.scope === "project" && args.projectRoot ? { project_root: args.projectRoot } : {}),
  };
}
