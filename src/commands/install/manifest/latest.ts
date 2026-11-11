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
    `\`--latest\` only applies to \`crew install\` with no references, which installs from \`${MANIFEST_FILENAME}\` — to move one skill, run \`crew update <name>\``,
  );
}

/**
 * True when no agent is active and none was asked for by name: the case in
 * which a bare install succeeds without touching any source (§9.2). Asked
 * before `--latest` contacts a remote, so that still holds.
 */
export function hasNoActiveAgent(config: Config, ctx: CommandContext): boolean {
  if (ctx.flags.agent.length > 0) return false;
  try {
    computeAgentSet(config, ctx.flags.agent);
    return false;
  } catch (err) {
    // `computeAgentSet` only raises `CrewError`; any but `no_agents` will be raised again by the install itself.
    return (err as CrewError).code === "no_agents";
  }
}

/**
 * `lock` with the entry of every line that takes one replaced by the commit
 * the line names on its remote now. A line whose ref the remote lists as
 * neither a branch nor a tag (an abbreviated commit) keeps what it had.
 * Contacts each line's remote; an unreachable one is `source_unreachable`.
 */
export function latestLock(manifest: Manifest, lock: Lock): Lock {
  const latest = new Map(lock);
  for (const entry of manifest.entries) {
    if (!needsLockEntry(entry)) continue;
    const sha = remoteCommitOf(entry.source.url, entry.source.ref);
    if (sha !== null) latest.set(entry.ref, sha);
  }
  return latest;
}
