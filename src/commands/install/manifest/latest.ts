/**
 * `crew install --latest` (§9.3): move a project's unpinned manifest lines
 * to the commit each names on its remote right now.
 *
 * Without the flag a locked line never moves, and install never refreshes
 * a clone it already has (§16.6). With it, each line that takes a lock
 * entry is looked up on its remote, installed at that commit, and recorded
 * there in the lockfile.
 */

import { CrewError } from "../../../core/errors.ts";
import { canonicalRepoUrl } from "../../../core/repo-url.ts";
import type { Config } from "../../../core/types.ts";
import { remoteCommitOf } from "../../../git/repo/remote.ts";
import { computeAgentSet } from "../../../install/agent-set.ts";
import {
  type Lock,
  MANIFEST_FILENAME,
  type Manifest,
  needsLockEntry,
} from "../../../manifest/index.ts";
import type { CommandContext } from "../../types.ts";

/** True when the run asked for `--latest`. */
export function wantsLatest(ctx: CommandContext): boolean {
  return Boolean(ctx.flags.extras["latest"]);
}

/** `--latest` is about the manifest's lines; with references on the command line it means nothing. */
export function rejectLatestWithReferences(ctx: CommandContext): null {
  if (!wantsLatest(ctx)) return null;
  throw new CrewError(
    "usage_error",
    `\`--latest\` only applies to \`crew install\` with no references, where it moves every unpinned line of \`${MANIFEST_FILENAME}\` to the commit its branch or tag now names — it cannot move one skill named on the command line`,
  );
}

/**
 * Select agents exactly as the install will, before `--latest` contacts any
 * remote. False when no agent is active and none was asked for by name: the
 * case in which a bare install succeeds without touching a source (§9.2).
 * Any other failure to select agents is raised here, as the install would
 * raise it, so it is never masked by a lookup that fails first.
 */
export function hasAgentToInstallInto(config: Config, ctx: CommandContext): boolean {
  try {
    computeAgentSet(config, ctx.flags.agent);
    return true;
  } catch (err) {
    const noneRequested = ctx.flags.agent.length === 0;
    if (err instanceof CrewError && err.code === "no_agents" && noneRequested) return false;
    throw err;
  }
}

/**
 * Remote lookups already made by the command now running, by repository and ref.
 * Null outside `withSharedRemoteLookups`, where every lookup goes to the remote.
 */
let lookups: Map<string, string | null> | null = null;

/** The sharing ends when `work` returns, so `work` must finish its lookups by then: no promises. */
type NotAPromise<T> = T extends PromiseLike<unknown> ? never : T;

/**
 * Run `work` with remote lookups shared: one command that installs several
 * projects asks each remote about each ref once, however many of the
 * projects name it. Nothing is remembered once the outermost `work` returns:
 * a call made while another is open joins it, and leaves its lookups in place.
 */
export function withSharedRemoteLookups<T>(work: () => NotAPromise<T>): T {
  const enclosing = lookups;
  lookups = enclosing ?? new Map();
  try {
    return work();
  } finally {
    lookups = enclosing;
  }
}

/** `remoteCommitOf`, answered from this command's earlier lookups when it can be. */
function remoteCommit(url: string, ref: string | null): string | null {
  // Spellings of one repository (a trailing `.git` or `/`) share an answer.
  const key = JSON.stringify([canonicalRepoUrl(url), ref]);
  const known = lookups?.get(key);
  if (known !== undefined) return known;
  const sha = remoteCommitOf(url, ref);
  lookups?.set(key, sha);
  return sha;
}

/**
 * `lock` with the entry of every line that takes one replaced by the commit
 * the line names on its remote now. A line whose ref the remote lists as
 * neither a branch nor a tag (an abbreviated commit) keeps what it had.
 * Each line's URL and ref is looked up on its remote, unless this command
 * already looked that pair up (`withSharedRemoteLookups`). An unreachable
 * remote is `source_unreachable`.
 */
export function latestLock(manifest: Manifest, lock: Lock): Lock {
  const latest = new Map(lock);
  for (const entry of manifest.entries) {
    if (!needsLockEntry(entry)) continue;
    const sha = remoteCommit(entry.source.url, entry.source.ref);
    if (sha !== null) latest.set(entry.ref, sha);
  }
  return latest;
}
