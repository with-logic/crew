/**
 * Install a newly-detected tap child (§10.1.1 step 2).
 *
 * Stages the child into the store, runs the install algorithm for
 * every target the rest of the tap was installed into, and returns a
 * fresh state entry only when every applicable target group succeeds.
 * Target-group failures attempt rollback and name affected targets; failed
 * restoration or lost ownership retains and reports any prior recovery copy.
 * Failed children have no state entry; later non-dry-run re-expansion retries them.
 */

import { type AgentAdapter, baseFor } from "../../agents/adapter.ts";
import { installSkillIntoAgents } from "../../agents/install.ts";
import { agentByName } from "../../agents/registry.ts";
import { CrewError, normalizeLocalError } from "../../core/errors.ts";
import type { Scope, StateEntry, TapConfig } from "../../core/types.ts";
import { stageIntoStore } from "../../sources/store.ts";
import { nowIso } from "../../util/time.ts";
import { ChildReplacement } from "./replacement.ts";

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
    /** Cleanup diagnostics on success; failures append them to the primary error. */
    readonly onWarning?: (warning: string) => void;
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
  const failures: string[] = [];
  let firstFailure: CrewError | null = null;
  const replacements: ChildReplacement[] = [];
  for (const [dest, group] of groups) {
    const replacement = new ChildReplacement(dest);
    replacements.push(replacement);
    try {
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
        beforeReplace: (staging) => replacement.moveAsideForReplacement(staging),
      });
      replacement.installed = outcome.kind === "installed";
      for (const a of group) successfulTargets.push(a.name);
    } catch (err) {
      const ce = normalizeLocalError(err);
      firstFailure ??= ce;
      failures.push(`${group.map((a) => a.name).join(", ")}: ${ce.message}`);
    }
  }
  // §10.1.1: a partial state entry would hide the failed targets on retry.
  if (firstFailure) {
    for (const replacement of replacements.reverse()) {
      const failure = replacement.rollback();
      if (failure) failures.push(failure);
    }
  }
  for (const replacement of replacements) {
    const warning = replacement.cleanup();
    if (warning === null) continue;
    if (firstFailure) failures.push(warning);
    else args.onWarning?.(warning);
  }
  if (firstFailure) throw new CrewError(firstFailure.code, failures.join("; "));
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
