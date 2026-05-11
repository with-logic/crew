/**
 * Directory-expansion helpers for the install resolver (§9 step 5).
 */

import type { Source, TapConfig } from "../../core/types.ts";
import { expandSkills, type SkippedSkill } from "../../sources/expand.ts";
import type { PendingItem } from "./enqueue.ts";

interface ExpansionItems {
  readonly items: PendingItem[];
  readonly skipped: readonly SkippedSkill[];
}

/** Walk `dir` and produce one PendingItem per skill found. */
export function expandSkillsAsItems(
  dir: string,
  tap: TapConfig,
  baseTapPath: string,
  resolvedSha: string | null,
  requestedRef: string | null,
  pinned: boolean,
  explicit: boolean,
  tracksTap: boolean,
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
    items.push({
      loaded: l,
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

export function sourcePinned(source: Source, resolvedSha: string | null): boolean {
  if (source.type !== "git") return false;
  if (source.ref === null) return false;
  // Classification happens in acquireTap; any explicit git ref is pinned here.
  void resolvedSha;
  return true;
}
