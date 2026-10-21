/**
 * Stage sibling dependencies with their parent's captured provenance (§9 step 6).
 *
 * A dependency named by a bare name is looked for beside its parent
 * first. "Beside" means "in the same commit the parent's bytes came
 * from". The invocation context retains that tree; this module turns
 * a hit into a pending item carrying the parent's ref and SHA.
 */

import type { Config } from "../../../core/types.ts";
import type { SkippedSkill } from "../../../sources/expand.ts";
import { isGistTap } from "../../../sources/gist.ts";
import { stageIntoStore } from "../../../sources/store.ts";
import type { SiblingHit } from "../../dep-resolution.ts";
import type { PendingItem } from "../enqueue.ts";

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
          undefined,
          isGistTap(sibling.tap),
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
