/**
 * Reading a parent skill's own tree during dependency resolution
 * (§9 step 6).
 *
 * A dependency named by a bare name is looked for beside its parent
 * first. "Beside" means "in the same commit the parent's bytes came
 * from", so when the parent was read at an explicit `@<ref>` this module
 * re-exports that commit for the sibling walk and turns a hit into a
 * pending item carrying the parent's ref and SHA.
 */

import { join, posix } from "node:path";
import type { Config, TapConfig } from "../../../core/types.ts";
import { withAcquiredTap } from "../../../sources/acquire/index.ts";
import type { SkippedSkill } from "../../../sources/expand.ts";
import { stageIntoStore } from "../../../sources/store.ts";
import type { SiblingHit } from "../../dep-resolution.ts";
import type { PendingItem } from "../enqueue.ts";

/**
 * Run `fn` against the tap root the parent's own content came from.
 *
 * A parent installed at `@<ref>` was read from a scratch export of that
 * commit, which has since been deleted, so it is re-exported for the
 * sibling walk. A parent with NO ref came from the live clone and needs
 * no export — `fn` gets `undefined` and the lookup uses its usual root.
 * The test is the presence of a ref, not `pinned`: a `@<branch>` parent
 * is unpinned but was still read from that branch's commit.
 *
 * Siblings sit beside the parent, so when the tap's subpath IS the
 * parent directory the export has to widen to the enclosing directory;
 * exporting the subpath alone would contain no siblings at all.
 */
export function withParentSkillDir<T>(
  parent: PendingItem,
  home: string,
  fn: (parentDir: string | undefined) => T,
): T {
  if (parent.requestedRef === null || parent.tap.kind !== "git") return fn(undefined);
  const widened: TapConfig = { ...parent.tap, subpath: enclosingSubpath(parent.tap.subpath) };
  // Inside the widened export, the parent sits at its own directory name
  // (subpath case) or at its tap-relative path (whole-repo tap case).
  const rel =
    parent.tap.subpath.length > 0
      ? posix.join(posix.basename(parent.tap.subpath), parent.tapRelativePath)
      : parent.tapRelativePath;
  return withAcquiredTap(widened, parent.requestedRef, home, (acq) =>
    fn(rel.length > 0 ? join(acq.rootDir, rel) : acq.rootDir),
  );
}

/**
 * The directory containing `subpath`, POSIX-style. Empty stays empty
 * (already the repository root).
 */
function enclosingSubpath(subpath: string): string {
  if (subpath.length === 0) return "";
  const parent = posix.dirname(subpath);
  return parent === "." || parent === "/" ? "" : parent;
}

/** Turn a sibling hit into a pending item attributed to the parent's commit. */
export function siblingItems(
  sibling: SiblingHit,
  parent: PendingItem,
  home: string,
): { items: PendingItem[]; config: Config; skipped: readonly SkippedSkill[] } {
  return {
    items: [
      {
        loaded: sibling.loaded,
        staged: stageIntoStore(
          sibling.loaded.path,
          sibling.loaded.frontmatter.name,
          parent.resolvedSha,
          home,
        ),
        tap: sibling.tap,
        tapRelativePath: sibling.tapRelativePath,
        resolvedSha: parent.resolvedSha,
        // The sibling's bytes came from the parent's commit, so it
        // carries the parent's ref too — recording `null` here would
        // claim a default-branch read with no ref (§9 step 3, §11.1).
        requestedRef: parent.requestedRef,
        pinned: parent.pinned,
        explicit: false,
        tracksTap: false,
      },
    ],
    config: sibling.config,
    skipped: [],
  };
}
