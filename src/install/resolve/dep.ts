/**
 * Dependency enqueueing for the install resolver (§9 step 6).
 */

import { join, posix } from "node:path";
import type { Config, TapConfig } from "../../core/types.ts";
import { parseRef } from "../../refs/parse.ts";
import { withAcquiredTap } from "../../sources/acquire/index.ts";
import type { SkippedSkill } from "../../sources/expand.ts";
import { stageIntoStore } from "../../sources/store.ts";
import { findSiblingDep, type SiblingHit } from "../dep-resolution.ts";
import { attributeRef } from "../tap-attribution.ts";
import { enqueueTapRef, type PendingItem } from "./enqueue.ts";
import { expandSkillsAsItems, sourceRequestedRef } from "./expand-items.ts";

/** Resolve and enqueue items for a dependency reference. */
export function enqueueDep(
  depRef: string,
  parent: PendingItem,
  config: Config,
  cwd: string,
  home: string,
): { items: PendingItem[]; config: Config; skipped: readonly SkippedSkill[] } {
  const source = parseRef(depRef, cwd);

  // Bare-name dep with a tap-aware parent: prefer a sibling in the parent's tap.
  if (source.type === "tap" && source.tap === null) {
    // A pinned parent's siblings must be read at the parent's commit,
    // not HEAD — otherwise their bytes get recorded under the parent's
    // SHA while actually coming from somewhere else (§9 step 3).
    const found = withParentRoot(parent, home, (parentDir) => {
      const sibling = findSiblingDep(
        { tap: parent.tap, tapRelativePath: parent.tapRelativePath, parentDir },
        source.name,
        home,
        config,
      );
      return sibling ? siblingItems(sibling, parent, home) : null;
    });
    if (found) return found;
    // Fall through to bare-name search across all configured taps.
  }

  if (source.type === "tap") return enqueueTapRef(source, config, home, false, null);

  // Git or path dep ref. Dep edges don't subscribe the user to every
  // sibling of the dep's source.
  const attrib = attributeRef(source, config);
  const requestedRef = sourceRequestedRef(source);
  const expansion = withAcquiredTap(attrib.tap, requestedRef, home, (acquired) =>
    expandSkillsAsItems(
      acquired.rootDir,
      attrib.tap,
      "",
      acquired.resolvedSha,
      requestedRef,
      acquired.pinned,
      false,
      false,
      home,
    ),
  );
  return { items: expansion.items, config: attrib.config, skipped: expansion.skipped };
}

/**
 * Run `fn` against the tap root the parent's own content came from.
 *
 * A parent installed at `@<ref>` was read from a scratch export of that
 * commit, which has since been deleted, so it is re-exported for the
 * sibling walk. An unpinned parent came from the live clone and needs no
 * export — `fn` gets `undefined` and the lookup uses its usual root.
 *
 * Siblings sit beside the parent, so when the tap's subpath IS the
 * parent directory the export has to widen to the enclosing directory;
 * exporting the subpath alone would contain no siblings at all.
 */
function withParentRoot<T>(
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

function siblingItems(
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
        // claim an unpinned default-branch read (§9 step 3, §11.1).
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
