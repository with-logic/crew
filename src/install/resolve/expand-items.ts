/**
 * Skill-expansion helpers for the install resolver (§9 step 5).
 */

import type { Source, TapConfig } from "../../core/types.ts";
import type { AcquiredTap } from "../../sources/acquire/index.ts";
import { discoveryOf, expandSkills, type SkippedSkill } from "../../sources/expand.ts";
import { gistLabel } from "../../sources/gist.ts";
import { stageIntoStore } from "../../sources/store.ts";
import type { PendingItem } from "./enqueue.ts";

interface ExpansionItems {
  readonly items: PendingItem[];
  readonly skipped: readonly SkippedSkill[];
}

/** How the items expanded from one location are recorded. */
export interface ItemOptions {
  /** Tap-relative path of the expanded location itself (`""` for the tap root). */
  readonly baseTapPath: string;
  /** The `@<ref>` the reference asked for, if any. */
  readonly requestedRef: string | null;
  /** True for a skill the user named; false for a dependency. */
  readonly explicit: boolean;
  /** See `ResolvedSkill.tracksTap` / `StateEntry.tracks_tap`. */
  readonly tracksTap: boolean;
}

/**
 * Expand `root` — a skill directory, a directory of skills, or a gist's
 * skill file — and produce one PendingItem per skill found.
 *
 * Each skill is staged into the store here rather than later in the
 * resolver loop: when the reference carried an `@ref`, `root` is in a
 * scratch export that is deleted as soon as acquisition scope ends
 * (§9 step 3), so the bytes must be captured while it still exists.
 */
export function expandSkillsAsItems(
  root: string,
  tap: TapConfig,
  acquired: AcquiredTap,
  options: ItemOptions,
  home: string,
): ExpansionItems {
  const { resolvedSha, pinned } = acquired;
  const mode = discoveryOf(tap);
  const label = mode === "gist" ? gistLabel(tap, resolvedSha) : undefined;
  const { valid, skipped } = expandSkills(root, mode, label);
  const { baseTapPath, requestedRef, explicit, tracksTap } = options;
  const items: PendingItem[] = [];
  for (const l of valid) {
    const subSegment = l.path === root ? "" : l.path.slice(root.length + 1);
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
