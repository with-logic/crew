/**
 * Directory-expansion helpers for the install resolver (§9 step 5).
 */

import type { Source, TapConfig } from "../../core/types.ts";
import { expandSkills, type SkippedSkill } from "../../sources/expand.ts";
import { stageIntoStore } from "../../sources/store.ts";
import type { PendingItem } from "./enqueue.ts";

interface ExpansionItems {
  readonly items: PendingItem[];
  readonly skipped: readonly SkippedSkill[];
}

/**
 * Walk `dir` and produce one PendingItem per skill found.
 *
 * Each skill is staged into the store here rather than later in the
 * resolver loop: when the reference carried an `@ref`, `dir` is a
 * scratch export that is deleted as soon as acquisition scope ends
 * (§9 step 3), so the bytes must be captured while it still exists.
 */
export function expandSkillsAsItems(
  dir: string,
  tap: TapConfig,
  baseTapPath: string,
  resolvedSha: string | null,
  requestedRef: string | null,
  pinned: boolean,
  explicit: boolean,
  tracksTap: boolean,
  home: string,
): ExpansionItems {
  const { valid, skipped } = expandSkills(dir, { recursive: tap.discovery === "recursive" });
  const items: PendingItem[] = [];
  for (const l of valid) {
    const subSegment = l.path === dir ? "" : l.path.slice(dir.length + 1);
    const tapRelativePath = baseTapPath
      ? subSegment
        ? `${baseTapPath}/${subSegment}`
        : baseTapPath
      : subSegment;
    const staged = stageIntoStore(l.path, l.frontmatter.name, resolvedSha, home);
    items.push({
      loaded: l,
      staged,
      tap,
      tapRelativePath,
      resolvedSha,
      requestedRef,
      pinned,
      explicit,
      tracksTap,
    });
  }
  return { items, skipped };
}

export function sourceRequestedRef(source: Source): string | null {
  if (source.type === "git") return source.ref;
  if (source.type === "tap") return source.ref;
  return null;
}
