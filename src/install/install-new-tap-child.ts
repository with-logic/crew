/**
 * Install a newly-detected tap child (§10.1.1 step 2).
 *
 * Stages the child into the store, runs the install algorithm for
 * every target the rest of the tap was installed into, and returns a
 * fresh state entry only if every target succeeds. Target failures roll
 * back copies created by this attempt and remain visible to the caller.
 */

import { lstatSync } from "node:fs";
import { type AgentAdapter, baseFor } from "../agents/adapter.ts";
import { installSkillIntoAgents } from "../agents/install.ts";
import { agentByName } from "../agents/registry.ts";
import { CrewError } from "../core/errors.ts";
import type { Scope, StateEntry, TapConfig } from "../core/types.ts";
import { isGistTap } from "../sources/gist.ts";
import { stageIntoStore } from "../sources/store.ts";
import { rmrf } from "../util/fs.ts";
import { nowIso } from "../util/time.ts";
import type { NewChildInstallResult, NewChildTargetResult } from "./tap-reexpand/types.ts";

export function installNewTapChild(
  args: {
    readonly skillDir: string;
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
): NewChildInstallResult {
  const childCwd = args.scope === "project" ? (args.projectRoot ?? fallbackCwd) : fallbackCwd;
  const staged = stageIntoStore(
    args.skillDir,
    args.skillName,
    args.resolvedSha,
    home,
    undefined,
    isGistTap(args.tap),
  );
  const successfulTargets: string[] = [];
  const perTarget: NewChildTargetResult[] = [];
  const created = new Map<string, AgentAdapter[]>();
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
  for (const [dest, group] of groups) {
    try {
      const existed = lstatSync(dest, { throwIfNoEntry: false }) !== undefined;
      const outcome = installSkillIntoAgents({
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
      if (!existed) created.set(dest, group);
      for (const a of group) {
        successfulTargets.push(a.name);
        perTarget.push({ agent: a.name, kind: outcome.kind });
      }
    } catch (err) {
      const cause = err as Error;
      for (const a of group)
        perTarget.push({
          agent: a.name,
          kind: "failed",
          error: {
            code: err instanceof CrewError ? err.code : "source_unreachable",
            message: cause.message,
          },
        });
    }
  }
  if (perTarget.some((target) => target.kind === "failed")) {
    rollbackCreated(created, perTarget);
    return { entry: null, perTarget };
  }
  if (successfulTargets.length === 0) return { entry: null, perTarget };
  const entry: StateEntry = {
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
  return { entry, perTarget };
}

/** §10.1.1: never remove an install that predates this attempt. */
function rollbackCreated(
  created: ReadonlyMap<string, readonly AgentAdapter[]>,
  perTarget: NewChildTargetResult[],
): void {
  for (const [dest, group] of created) {
    let error: { readonly code: string; readonly message: string } | undefined;
    try {
      rmrf(dest);
    } catch (err) {
      const cause = err as Error;
      error = {
        code: "source_unreachable",
        message: `Could not roll back ${dest}: ${cause.message}`,
      };
    }
    for (const adapter of group) {
      const index = perTarget.findIndex((target) => target.agent === adapter.name);
      perTarget[index] = error
        ? { agent: adapter.name, kind: "failed", error }
        : { agent: adapter.name, kind: "rolled_back" };
    }
  }
}
