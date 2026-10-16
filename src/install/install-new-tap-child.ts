/**
 * Install a newly-detected tap child (§10.1.1 step 2).
 *
 * Stages the child into the store, runs the install algorithm for
 * every target the rest of the tap was installed into, and returns a
 * fresh state entry on success — or null when no agent target applies,
 * or a safety check (§7.3) refused every one. An agent folder crew can't
 * write throws, so the child is reported and retried, not recorded
 * without that agent — and is removed from the agents it was just
 * installed into, so it is installed nowhere.
 */

import { type AgentAdapter, baseFor } from "../agents/adapter.ts";
import { installSkillIntoAgents } from "../agents/install.ts";
import { agentByName } from "../agents/registry.ts";
import { CrewError } from "../core/errors.ts";
import type { Scope, StateEntry, TapConfig } from "../core/types.ts";
import { stageIntoStore } from "../sources/store.ts";
import { rmrf } from "../util/fs.ts";
import { nowIso } from "../util/time.ts";

export function installNewTapChild(
  args: {
    readonly skillPath: string;
    readonly skillName: string;
    readonly tapRelativePath: string;
    readonly scope: Scope;
    readonly tap: TapConfig;
    readonly agents: readonly string[];
    readonly resolvedSha: string | null;
    readonly projectRoot: string | null;
    /** The ref the group tracks, and whether it is immutable (§11.1). */
    readonly ref: string | null;
    readonly pinned: boolean;
  },
  force: boolean,
  home: string,
  fallbackCwd: string,
): StateEntry | null {
  const childCwd = args.scope === "project" ? (args.projectRoot ?? fallbackCwd) : fallbackCwd;
  const staged = stageIntoStore(args.skillPath, args.skillName, args.resolvedSha, home);
  const successfulTargets: string[] = [];
  // Group adapters by resolved install path (path sharing, §7.2) so
  // shared-path targets install once but both get marked successful.
  const groups = new Map<string, AgentAdapter[]>();
  for (const targetName of args.agents) {
    const adapter = agentByName(targetName);
    if (!adapter) continue;
    const base = baseFor(adapter, args.scope, childCwd);
    if (base === "") continue;
    const dest = `${base}/${args.skillName}`;
    const existing = groups.get(dest);
    if (existing) existing.push(adapter);
    else groups.set(dest, [adapter]);
  }
  let fsFailure: unknown = null;
  // A folder that already held a crew marker naming this skill is a
  // recorded install, and is kept; any other this call installed into —
  // new, or replaced by `--force` — is removed if the child fails.
  const destsToRemove: string[] = [];
  for (const [dest, group] of groups) {
    try {
      const res = installSkillIntoAgents({
        agents: group,
        scope: args.scope,
        cwd: childCwd,
        storePath: staged.storePath,
        skillName: args.skillName,
        tap: args.tap,
        tapRelativePath: args.tapRelativePath,
        ref: args.ref,
        resolvedSha: args.resolvedSha,
        contentHash: staged.contentHash,
        force,
      });
      for (const a of group) successfulTargets.push(a.name);
      if (res.kind === "installed" && !res.replacedSameName) destsToRemove.push(dest);
    } catch (err) {
      // A safety check refusing one agent (§7.3) leaves the child out of
      // it, as on an install; an agent folder crew can't write fails the
      // child (§10.1.1), so it is retried rather than recorded without it.
      if (err instanceof CrewError) continue;
      fsFailure = err;
      break;
    }
  }
  if (fsFailure !== null) {
    // Not recorded means installed nowhere: the copies this child just
    // made in other agents go, so nothing is left that state doesn't know.
    for (const dest of destsToRemove) rmrf(dest);
    throw fsFailure;
  }
  if (successfulTargets.length === 0) return null;
  return {
    name: args.skillName,
    source: { tap: args.tap.name, path: args.tapRelativePath },
    // A child discovered while re-expanding a ref-tracking group came
    // from that ref's commit, so it records the same ref — writing
    // `null` would claim a default-branch read of bytes that never came
    // from the default branch (§10.1.1, §11.1).
    ref: args.ref,
    resolved_sha: args.resolvedSha,
    content_hash: staged.contentHash,
    scope: args.scope,
    installed_at: nowIso(),
    agents: successfulTargets,
    pinned: args.pinned,
    explicit: true,
    // Tap re-expansion only fires for whole-tap groups, so a child
    // added this way is also whole-tap-tracked — future siblings
    // should follow too.
    tracks_tap: true,
    required_by: [],
    ...(args.scope === "project" && args.projectRoot ? { project_root: args.projectRoot } : {}),
  };
}
