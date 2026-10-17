/**
 * Install a newly-detected tap child (§10.1.1 step 2).
 *
 * Stages the child into the store, runs the install algorithm for
 * every target the rest of the tap was installed into, and returns a
 * fresh state entry (`./entry.ts`) on success — or null when no agent
 * target applies, or a safety check (§7.3) refused every one. An agent
 * folder crew can't write throws, so the child is reported and retried,
 * not recorded without that agent — and is taken back from the agents it
 * was just installed into (`./rollback.ts`), so it is installed nowhere.
 */

import { type AgentAdapter, baseFor } from "../../agents/adapter.ts";
import { installSkillIntoAgents } from "../../agents/install.ts";
import { agentByName } from "../../agents/registry.ts";
import { CrewError } from "../../core/errors.ts";
import type { Scope, StateEntry, TapConfig } from "../../core/types.ts";
import { type StoredSkill, stageIntoStore } from "../../sources/store.ts";
import { withLeftBehind } from "../../util/cleanup.ts";
import { newChildEntry } from "./entry.ts";
import { type ChildCopy, takeBackCopies } from "./rollback.ts";

/** A newly-detected child of a tracked tap, and where its group is installed. */
export interface NewTapChild {
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
}

export function installNewTapChild(
  args: NewTapChild,
  force: boolean,
  home: string,
  fallbackCwd: string,
): StateEntry | null {
  const cwd = args.scope === "project" ? (args.projectRoot ?? fallbackCwd) : fallbackCwd;
  const staged = stageIntoStore(args.skillPath, args.skillName, args.resolvedSha, home);
  const run = installIntoGroups(args, groupsByDest(args, cwd), { cwd, staged, force });
  // Not recorded means installed nowhere: the copies this child just
  // made in other agents go, so nothing is left that state doesn't know.
  if (run.failure !== null) throw withLeftBehind(run.failure, takeBackCopies(run.copies));
  if (run.installedInto.length === 0) return null;
  return newChildEntry(args, staged.contentHash, run.installedInto);
}

/**
 * `args.agents` by the folder each installs into (path sharing, §7.2),
 * so agents sharing a folder install once but all count as installed.
 */
function groupsByDest(args: NewTapChild, cwd: string): Map<string, AgentAdapter[]> {
  const groups = new Map<string, AgentAdapter[]>();
  for (const targetName of args.agents) {
    const adapter = agentByName(targetName);
    if (!adapter) continue;
    const base = baseFor(adapter, args.scope, cwd);
    if (base === "") continue;
    const dest = `${base}/${args.skillName}`;
    const existing = groups.get(dest);
    if (existing) existing.push(adapter);
    else groups.set(dest, [adapter]);
  }
  return groups;
}

/** What installing into the groups did, up to the failure that stopped it, if one did. */
interface GroupsRun {
  readonly installedInto: readonly string[];
  /** The copies to take back if the child fails. */
  readonly copies: readonly ChildCopy[];
  readonly failure: unknown;
}

/**
 * Install the child into each group in turn, stopping at the first agent
 * folder crew can't write (§10.1.1): no later agent is written.
 */
function installIntoGroups(
  args: NewTapChild,
  groups: ReadonlyMap<string, readonly AgentAdapter[]>,
  opts: { readonly cwd: string; readonly staged: StoredSkill; readonly force: boolean },
): GroupsRun {
  const installedInto: string[] = [];
  // A folder that already held a crew marker naming this skill is a
  // recorded install, and is kept; any other this call installed into —
  // new, or replaced by `--force` — is taken back if the child fails.
  const copies: ChildCopy[] = [];
  const { contentHash, storePath } = opts.staged;
  for (const [dest, group] of groups) {
    try {
      const res = installSkillIntoAgents({
        agents: group,
        scope: args.scope,
        cwd: opts.cwd,
        storePath,
        skillName: args.skillName,
        tap: args.tap,
        tapRelativePath: args.tapRelativePath,
        ref: args.ref,
        resolvedSha: args.resolvedSha,
        contentHash,
        force: opts.force,
      });
      for (const a of group) installedInto.push(a.name);
      if (res.kind === "installed" && !res.replacedSameName) {
        copies.push({ dest, name: args.skillName, contentHash });
      }
    } catch (err) {
      // A safety check refusing one agent (§7.3) leaves the child out of
      // it, as on an install; an agent folder crew can't write fails the
      // child (§10.1.1), so it is retried rather than recorded without it.
      if (err instanceof CrewError) continue;
      return { installedInto, copies, failure: err };
    }
  }
  return { installedInto, copies, failure: null };
}
