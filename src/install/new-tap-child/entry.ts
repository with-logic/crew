/**
 * The state entry a newly-detected tap child records once installed
 * (§10.1.1 step 2, §11.1).
 */

import type { StateEntry } from "../../core/types.ts";
import { nowIso } from "../../util/time.ts";
import type { NewTapChild } from "./index.ts";

/** `child`'s entry: installed into `agents`, its store copy hashing to `contentHash`. */
export function newChildEntry(
  child: NewTapChild,
  contentHash: string,
  agents: readonly string[],
): StateEntry {
  return {
    name: child.skillName,
    source: { tap: child.tap.name, path: child.tapRelativePath },
    // A child discovered while re-expanding a ref-tracking group came
    // from that ref's commit, so it records the same ref — writing
    // `null` would claim a default-branch read of bytes that never came
    // from the default branch (§10.1.1, §11.1).
    ref: child.ref,
    resolved_sha: child.resolvedSha,
    content_hash: contentHash,
    scope: child.scope,
    installed_at: nowIso(),
    agents,
    pinned: child.pinned,
    explicit: true,
    // Tap re-expansion only fires for whole-tap groups, so a child
    // added this way is also whole-tap-tracked — future siblings
    // should follow too.
    tracks_tap: true,
    required_by: [],
    ...(child.scope === "project" && child.projectRoot ? { project_root: child.projectRoot } : {}),
  };
}
