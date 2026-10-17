/**
 * Install a newly-detected tap child (§10.1.1 step 2).
 *
 * Stages the child into the store, runs the install algorithm for
 * every target the rest of the tap was installed into, and returns a
 * fresh state entry (`./entry.ts`) on success — or null when no agent
 * target applies, or a safety check (§7.3) refused every one. An agent
 * folder crew can't write throws, so the child is reported and retried,
 * not recorded without that agent — and is removed from the agents it
 * was just installed into (`./removal.ts`), so it is installed nowhere.
 */

import { realpathSync } from "node:fs";
import { installSkillIntoAgents, isSafetyRefusal } from "../../agents/install.ts";
import type { Scope, StateEntry, TapConfig } from "../../core/types.ts";
import { type StoredSkill, stageIntoStore } from "../../sources/store.ts";
import { appendLeftBehind } from "../../util/cleanup.ts";
import { jsonText } from "../../util/json.ts";
import { adaptersNamed, type DestGroup, groupAgentsByDest } from "../dest-groups.ts";
import { newChildEntry } from "./entry.ts";
import { type ChildCopy, removeChildCopies } from "./removal.ts";

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

/** How `installNewTapChild` runs. */
export interface NewTapChildRun {
  readonly force: boolean;
  /** Crew's home, whose store the child is staged into. */
  readonly home: string;
  /** The cwd: a user-scope child's, or a project one's with no recorded root. */
  readonly fallbackCwd: string;
}

export function installNewTapChild(args: NewTapChild, opts: NewTapChildRun): StateEntry | null {
  const { force, home, fallbackCwd } = opts;
  const cwd = args.scope === "project" ? (args.projectRoot ?? fallbackCwd) : fallbackCwd;
  const staged = stageIntoStore(args.skillPath, args.skillName, args.resolvedSha, home);
  const groups = groupAgentsByDest(adaptersNamed(args.agents), args.skillName, args.scope, cwd);
  const run = installIntoGroups(args, groups, { cwd, staged, force });
  // Not recorded means installed nowhere: the copies this child just
  // made in other agents go, so nothing is left that state doesn't know.
  if (run.failure !== null) throw appendLeftBehind(run.failure, removeChildCopies(run.copies));
  if (run.installedInto.length === 0) return null;
  return newChildEntry(args, staged.contentHash, run.installedInto);
}

/** What installing into the groups did, up to the failure that stopped it, if one did. */
interface GroupsRun {
  readonly installedInto: readonly string[];
  /** The copies to remove if the child fails. */
  readonly copies: readonly ChildCopy[];
  readonly failure: Error | null;
}

/**
 * Install the child into each group in turn, stopping at the first agent
 * folder crew can't write (§10.1.1): no later agent is written.
 */
function installIntoGroups(
  args: NewTapChild,
  groups: readonly DestGroup[],
  opts: { readonly cwd: string; readonly staged: StoredSkill; readonly force: boolean },
): GroupsRun {
  const installedInto: string[] = [];
  // A folder that already held a crew marker naming this skill is a
  // recorded install, and is kept; any other this call installed into —
  // new, or replaced by `--force` — is removed if the child fails.
  const copies: ChildCopy[] = [];
  // Each copy by the folder it really is: agents whose skills folders are
  // one folder through a link (§7.2) write it again, and what that later
  // write leaves is this run's too.
  const byFolder = new Map<string, number>();
  const { contentHash, storePath } = opts.staged;
  for (const { dest, agents: group } of groups) {
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
      if (res.kind === "installed") {
        const folder = realpathSync(dest);
        const markerText = jsonText(res.marker);
        const earlier = byFolder.get(folder);
        if (earlier !== undefined) copies[earlier] = { ...copies[earlier]!, markerText };
        else if (!res.replacedSameName) {
          byFolder.set(folder, copies.length);
          copies.push({ dest, contentHash, markerText });
        }
      }
    } catch (err) {
      // A safety check refusing one agent (§7.3) leaves the child out of
      // it, as on an install; any other error — an agent folder crew can't
      // write or read — fails the child (§10.1.1), so it is retried rather
      // than recorded without it.
      if (isSafetyRefusal(err)) continue;
      // `installSkillIntoAgents` throws only `Error`s: `CrewError`, or fs.
      return { installedInto, copies, failure: err as Error };
    }
  }
  return { installedInto, copies, failure: null };
}
