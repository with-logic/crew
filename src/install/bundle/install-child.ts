/**
 * Install a newly-detected bundle child (§10.1.1 step 3).
 *
 * Stages the child into the store, runs the install algorithm for
 * every target the bundle currently targets, and returns a fresh state
 * entry on success. Per-target failures are non-fatal — the child just
 * isn't installed on that target. If every target fails, returns null
 * and the bundle walker treats it as a bundle-level error.
 */

import type { BundleRef, Scope, StateEntry } from "../../core/types.ts";
import { stageIntoStore } from "../../sources/store.ts";
import { installSkillIntoTarget } from "../../targets/install.ts";
import { adapterByName } from "../../targets/registry.ts";
import { nowIso } from "../../util/time.ts";

export function installNewBundleChild(
  args: {
    readonly skillDir: string;
    readonly skillName: string;
    readonly scope: Scope;
    readonly bundle: BundleRef;
    readonly targets: readonly string[];
    readonly resolvedSha: string | null;
    readonly requestedRef: string | null;
    readonly pinned: boolean;
    readonly projectRoot: string | null;
  },
  force: boolean,
  home: string,
  fallbackCwd: string,
): StateEntry | null {
  // For project-scoped bundles, new children install at the same
  // `project_root` as their siblings. User-scoped bundles don't care
  // about cwd, so the fallback is fine there.
  const childCwd = args.scope === "project" ? (args.projectRoot ?? fallbackCwd) : fallbackCwd;
  const staged = stageIntoStore(args.skillDir, args.skillName, args.resolvedSha, home);
  const successfulTargets: string[] = [];
  for (const targetName of args.targets) {
    const adapter = adapterByName(targetName);
    if (!adapter) continue;
    try {
      installSkillIntoTarget({
        adapter,
        scope: args.scope,
        cwd: childCwd,
        storePath: staged.storePath,
        skillName: args.skillName,
        markerSource: markerSourceForBundleChild(args.bundle, args.skillName),
        ref: args.requestedRef,
        resolvedSha: args.resolvedSha,
        contentHash: staged.contentHash,
        force,
      });
      successfulTargets.push(targetName);
    } catch {
      // Per-target failure is non-fatal.
    }
  }
  if (successfulTargets.length === 0) return null;
  return {
    name: args.skillName,
    source: markerSourceForBundleChild(args.bundle, args.skillName),
    ref: args.requestedRef,
    resolved_sha: args.resolvedSha,
    content_hash: staged.contentHash,
    scope: args.scope,
    installed_at: nowIso(),
    targets: successfulTargets,
    pinned: args.pinned,
    explicit: true,
    required_by: [],
    bundle: args.bundle,
    ...(args.scope === "project" && args.projectRoot ? { project_root: args.projectRoot } : {}),
  };
}

/**
 * Derive the marker source for a freshly-installed bundle child.
 * `bundle.source` records the container; a child lives one level deeper.
 * `BundleRef.source` excludes `path` by construction (§11.1) — local
 * directories are never bundles — so only `tap` and `git` are handled.
 */
function markerSourceForBundleChild(bundle: BundleRef, childName: string): StateEntry["source"] {
  if (bundle.source.type === "tap") {
    return { type: "tap", tap: bundle.source.tap, path: `${bundle.source.path}/${childName}` };
  }
  const sub = bundle.source.subpath;
  return {
    type: "git",
    url: bundle.source.url,
    subpath: sub.length > 0 ? `${sub}/${childName}` : childName,
  };
}
