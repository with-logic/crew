/**
 * Skill-expansion helpers for the install resolver (§9 step 5).
 */

import type { Source, TapConfig } from "../../core/types.ts";
import type { AcquiredTap } from "../../sources/acquire/index.ts";
import { expandTapSkills, type SkippedSkill } from "../../sources/expand.ts";
import { type StoredSkill, stageIntoStore } from "../../sources/store.ts";
import { errnoReason } from "../../util/errno.ts";
import type { PendingItem } from "./enqueue.ts";

interface ExpansionItems {
  readonly items: PendingItem[];
  readonly skipped: readonly SkippedSkill[];
}

/** How the items expanded from one location are recorded: as `PendingItem`s, under `baseTapPath`. */
export type ItemOptions = Pick<PendingItem, "requestedRef" | "explicit" | "tracksTap"> & {
  /** Tap-relative path of the expanded location itself (`""` for the tap root). */
  readonly baseTapPath: string;
};

/**
 * Expand `root` — a skill directory, a directory of skills, or a gist's
 * skill file — and produce one PendingItem per skill found.
 *
 * Each skill is staged into the store here rather than later in the
 * resolver loop: when the reference carried an `@ref`, `root` is in a
 * scratch export that is deleted as soon as acquisition scope ends
 * (§9 step 3), so the bytes must be captured while it still exists. A
 * skill with a file crew can't copy is skipped as `source_unreachable`
 * (§9 step 8), and the rest still install.
 */
export function expandSkillsAsItems(
  root: string,
  tap: TapConfig,
  acquired: AcquiredTap,
  options: ItemOptions,
  home: string,
): ExpansionItems {
  const { resolvedSha, pinned } = acquired;
  const expanded = expandTapSkills(root, tap, resolvedSha);
  const skipped = [...expanded.skipped];
  const { baseTapPath, requestedRef, explicit, tracksTap } = options;
  const items: PendingItem[] = [];
  for (const l of expanded.valid) {
    const subSegment = l.path === root ? "" : l.path.slice(root.length + 1);
    const tapRelativePath = baseTapPath
      ? subSegment
        ? `${baseTapPath}/${subSegment}`
        : baseTapPath
      : subSegment;
    const staged = stageOrSkip(l.path, l.frontmatter.name, resolvedSha, home, skipped);
    if (staged === null) continue;
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

/**
 * Stage one skill, or record it in `skipped` when one of its files can't
 * be copied. Staging only touches the filesystem, so what it throws is an
 * `ErrnoException`, whose `path` names the file.
 */
function stageOrSkip(
  path: string,
  name: string,
  resolvedSha: string | null,
  home: string,
  skipped: SkippedSkill[],
): StoredSkill | null {
  try {
    return stageIntoStore(path, name, resolvedSha, home);
  } catch (err) {
    const file = (err as NodeJS.ErrnoException).path ?? path;
    const message = `couldn't copy \`${file}\` into the store — ${errnoReason(err)}`;
    skipped.push({ path, message, code: "source_unreachable" });
    return null;
  }
}

export function sourceRequestedRef(source: Source): string | null {
  if (source.type === "git") return source.ref;
  if (source.type === "tap") return source.ref;
  return null;
}
