/**
 * Reading a parent skill's own tree during dependency resolution
 * (§9 step 6).
 *
 * A dependency named by a bare name is looked for beside its parent
 * first. "Beside" means "in the same commit the parent's bytes came
 * from", so when the parent was read at an explicit `@<ref>` this module
 * re-exports that commit for the sibling walk — once per tap and commit,
 * however many parents read it, while it stays among the few held at once
 * (`MAX_HELD_EXPORTS`) — and turns a hit into a pending item carrying the
 * parent's ref and SHA.
 */

import { join, posix } from "node:path";
import type { Config, TapConfig } from "../../../core/types.ts";
import { type HeldTap, holdAcquiredTap } from "../../../sources/acquire/index.ts";
import type { SkippedSkill } from "../../../sources/expand.ts";
import { stageIntoStore } from "../../../sources/store.ts";
import { isWholeRepoRootSkill, type SiblingHit } from "../../dep-resolution.ts";
import type { SiblingScan } from "../../siblings/index.ts";
import type { PendingItem } from "../enqueue.ts";

/**
 * The most commit exports a resolution holds at once. Each is a whole
 * tree, so one reading siblings at many commits keeps only the few it read
 * most recently; one it let go is exported again if a later parent needs
 * it. A sibling found in it was staged into the store already (§9 step 8).
 */
export const MAX_HELD_EXPORTS = 4;

/** The commits parents' siblings are read at, each exported once while it is held. */
export interface ParentTrees {
  /**
   * The parent skill's location in the commit its content came from — or
   * `undefined` when no export is needed: the parent came from the live
   * source (a clone with no ref, or a path tap), or is a whole-repo root
   * skill, which has no siblings to read.
   */
  locate(
    parent: Pick<PendingItem, "tap" | "tapRelativePath" | "resolvedSha" | "requestedRef">,
  ): string | undefined;
  /**
   * Delete every export still held: the resolution's last step, so none
   * outlives it. Never throws: one crew can't remove is left, noted under
   * `--verbose` (`exportTree`), as is one let go earlier.
   */
  release(): void;
}

/**
 * A parent installed at `@<ref>` was read from a scratch export of that
 * commit, which has since been deleted, so it is re-exported for the
 * sibling walk. A parent with NO ref came from the live source and needs
 * no export: the lookup uses its usual root. The test is the presence of
 * a ref, not `pinned`: a `@<branch>` parent is unpinned but was still read
 * from that branch's commit.
 *
 * Siblings sit beside the parent, so when the tap's subpath IS the
 * parent directory the export has to widen to the enclosing directory;
 * exporting the subpath alone would contain no siblings at all.
 * `onRelease` is told each export's root as it goes, evicted or released.
 */
export function makeParentTrees(home: string, onRelease: (root: string) => void): ParentTrees {
  // Least recently read first: a hit moves to the end.
  const held = new Map<string, HeldTap>();
  const drop = (tree: HeldTap): void => {
    onRelease(tree.acquired.rootDir);
    tree.release();
  };
  return {
    locate(parent) {
      const usesLiveSource =
        parent.requestedRef === null || parent.resolvedSha === null || parent.tap.kind !== "git";
      if (usesLiveSource || isWholeRepoRootSkill(parent.tap, parent.tapRelativePath)) {
        return undefined;
      }
      const widened: TapConfig = { ...parent.tap, subpath: enclosingSubpath(parent.tap.subpath) };
      const key = JSON.stringify([widened.name, widened.subpath, parent.resolvedSha]);
      // Another root's fetch can move a branch; siblings use the captured commit (§9 step 3).
      const tree = held.get(key) ?? holdAcquiredTap(widened, parent.resolvedSha, home);
      held.delete(key);
      held.set(key, tree);
      // The one just read is the most recent, so it is never the one let go.
      for (const [oldest, old] of held) {
        if (held.size <= MAX_HELD_EXPORTS) break;
        held.delete(oldest);
        drop(old);
      }
      // Inside the widened export, the parent sits at its own directory name
      // (subpath case) or at its tap-relative path (whole-repo tap case).
      const rel =
        parent.tap.subpath.length > 0
          ? posix.join(posix.basename(parent.tap.subpath), parent.tapRelativePath)
          : parent.tapRelativePath;
      return rel.length > 0 ? join(tree.acquired.rootDir, rel) : tree.acquired.rootDir;
    },
    release() {
      const trees = [...held.values()];
      held.clear();
      for (const tree of trees) drop(tree);
    },
  };
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

/**
 * Turn a sibling hit into a pending item attributed to the parent's
 * commit. A sibling many parents depend on is staged once (`siblings`).
 */
export function siblingItems(
  sibling: SiblingHit,
  parent: Pick<PendingItem, "resolvedSha" | "requestedRef" | "pinned">,
  home: string,
  siblings: SiblingScan,
): { items: PendingItem[]; config: Config; skipped: readonly SkippedSkill[] } {
  const { path, frontmatter } = sibling.loaded;
  const stage = () => stageIntoStore(path, frontmatter.name, parent.resolvedSha, home);
  return {
    items: [
      {
        loaded: sibling.loaded,
        staged: siblings.staged(`${path}\0${parent.resolvedSha ?? ""}`, stage),
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
