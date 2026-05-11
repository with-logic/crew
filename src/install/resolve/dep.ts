/**
 * Dependency enqueueing for the install resolver (§9 step 6).
 */

import type { Config } from "../../core/types.ts";
import { parseRef } from "../../refs/parse.ts";
import { acquireTap } from "../../sources/acquire/index.ts";
import type { SkippedSkill } from "../../sources/expand.ts";
import { findSiblingDep, type SiblingHit } from "../dep-resolution.ts";
import { attributeRef } from "../tap-attribution.ts";
import { enqueueTapRef, type PendingItem } from "./enqueue.ts";
import { expandSkillsAsItems, sourcePinned, sourceRequestedRef } from "./expand-items.ts";

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
    const sibling = findSiblingDep(
      { tap: parent.tap, tapRelativePath: parent.tapRelativePath },
      source.name,
      home,
      config,
    );
    if (sibling) return siblingItems(sibling, parent);
    // Fall through to bare-name search across all configured taps.
  }

  if (source.type === "tap") return enqueueTapRef(source, config, home, false, null);

  // Git or path dep ref. Dep edges don't subscribe the user to every
  // sibling of the dep's source.
  const attrib = attributeRef(source, config);
  const acquired = acquireTap(attrib.tap, home);
  const expansion = expandSkillsAsItems(
    acquired.rootDir,
    attrib.tap,
    "",
    acquired.resolvedSha,
    sourceRequestedRef(source),
    sourcePinned(source, acquired.resolvedSha),
    false,
    false,
  );
  return { items: expansion.items, config: attrib.config, skipped: expansion.skipped };
}

function siblingItems(
  sibling: SiblingHit,
  parent: PendingItem,
): { items: PendingItem[]; config: Config; skipped: readonly SkippedSkill[] } {
  return {
    items: [
      {
        loaded: sibling.loaded,
        tap: sibling.tap,
        tapRelativePath: sibling.tapRelativePath,
        resolvedSha: parent.resolvedSha,
        requestedRef: null,
        pinned: parent.pinned,
        explicit: false,
        tracksTap: false,
      },
    ],
    config: sibling.config,
    skipped: [],
  };
}
