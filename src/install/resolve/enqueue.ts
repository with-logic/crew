/**
 * Enqueue helpers for the install resolver (§9).
 *
 * `resolveInstallSet` in `./index.ts` orchestrates the dependency
 * walk; tap-reference expansion lives here to keep that orchestration
 * separate from reference resolution details.
 */

import { join } from "node:path";
import type { Config, LoadedSkill, TapConfig } from "../../core/types.ts";
import { withAcquiredTap } from "../../sources/acquire/index.ts";
import type { SkippedSkill } from "../../sources/expand.ts";
import type { StoredSkill } from "../../sources/store.ts";
import { type KindHint, resolveTapRef } from "../resolve-ref/index.ts";
import { expandSkillsAsItems } from "./expand-items.ts";

/**
 * Where a candidate's skill directory lives in the acquired tree.
 *
 * `resolveTapRef` indexes the tap's live clone, so `location.path` is
 * absolute inside it. When a ref was requested the content comes from a
 * scratch export instead, so rebuild the path from the tap-relative one
 * against the acquired root (§9 step 3).
 */
function memberDir(
  rootDir: string,
  location: { readonly path: string; readonly tapRelativePath: string },
  ref: string | null,
): string {
  if (ref === null) return location.path;
  return location.tapRelativePath.length > 0 ? join(rootDir, location.tapRelativePath) : rootDir;
}

export interface PendingItem {
  readonly loaded: LoadedSkill;
  /** Store entry captured during expansion (see `expandSkillsAsItems`). */
  readonly staged: StoredSkill;
  readonly tap: TapConfig;
  readonly tapRelativePath: string;
  readonly resolvedSha: string | null;
  readonly requestedRef: string | null;
  readonly pinned: boolean;
  readonly explicit: boolean;
  /** See `ResolvedSkill.tracksTap` / `StateEntry.tracks_tap`. */
  readonly tracksTap: boolean;
}

/** Resolve a tap/namespace/skill ref into items. */
export function enqueueTapRef(
  source: { tap: string | null; namespace: string | null; name: string; ref: string | null },
  config: Config,
  home: string,
  explicit: boolean,
  kindHint: KindHint,
): { items: PendingItem[]; config: Config; skipped: readonly SkippedSkill[] } {
  // Whole-tap install short-circuit: bare `<name>` that is the name of
  // a configured tap. Cross-tap collisions are handled earlier in the
  // CLI layer via `detectCollision`; reaching this point means the CLI
  // already prompted or `--yes` was in play.
  if (
    source.tap === null &&
    source.namespace === null &&
    (kindHint === "tap" || kindHint === null)
  ) {
    const matched = config.taps.find((c) => c.name === source.name);
    if (matched) {
      const expansion = withAcquiredTap(matched, source.ref, home, (acquired) =>
        expandSkillsAsItems(
          acquired.rootDir,
          matched,
          "",
          acquired.resolvedSha,
          source.ref,
          acquired.pinned,
          explicit,
          true,
          home,
        ),
      );
      return { items: expansion.items, config, skipped: expansion.skipped };
    }
  }

  const candidate = resolveTapRef(
    {
      type: "tap",
      tap: source.tap,
      namespace: source.namespace,
      name: source.name,
      ref: source.ref,
    },
    config,
    home,
    kindHint,
  );

  if (candidate.kind === "namespace") {
    const items: PendingItem[] = [];
    const skipped: SkippedSkill[] = [];
    withAcquiredTap(candidate.tap, source.ref, home, (acquired) => {
      for (const member of candidate.members) {
        const expansion = expandSkillsAsItems(
          memberDir(acquired.rootDir, member, source.ref),
          candidate.tap,
          member.tapRelativePath,
          acquired.resolvedSha,
          source.ref,
          acquired.pinned,
          explicit,
          true,
          home,
        );
        items.push(...expansion.items);
        skipped.push(...expansion.skipped);
      }
    });
    return { items, config, skipped };
  }

  const skill = candidate as Extract<typeof candidate, { kind: "skill" }>;
  const expansion = withAcquiredTap(skill.tap, source.ref, home, (acquired) =>
    expandSkillsAsItems(
      memberDir(acquired.rootDir, skill.location, source.ref),
      skill.tap,
      skill.location.tapRelativePath,
      acquired.resolvedSha,
      source.ref,
      acquired.pinned,
      explicit,
      false,
      home,
    ),
  );
  return { items: expansion.items, config, skipped: expansion.skipped };
}
