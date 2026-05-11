/**
 * Enqueue helpers for the install resolver (§9).
 *
 * `resolveInstallSet` in `./index.ts` orchestrates the dependency
 * walk; tap-reference expansion lives here to keep that orchestration
 * separate from reference resolution details.
 */

import type { Config, LoadedSkill, TapConfig } from "../../core/types.ts";
import { acquireTap } from "../../sources/acquire/index.ts";
import type { SkippedSkill } from "../../sources/expand.ts";
import { type KindHint, resolveTapRef } from "../resolve-ref/index.ts";
import { expandSkillsAsItems } from "./expand-items.ts";

export interface PendingItem {
  readonly loaded: LoadedSkill;
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
      const acquired = acquireTap(matched, home);
      const expansion = expandSkillsAsItems(
        acquired.rootDir,
        matched,
        "",
        acquired.resolvedSha,
        source.ref,
        source.ref !== null,
        explicit,
        true,
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
    const acquired = acquireTap(candidate.tap, home);
    const items: PendingItem[] = [];
    const skipped: SkippedSkill[] = [];
    for (const member of candidate.members) {
      const expansion = expandSkillsAsItems(
        member.path,
        candidate.tap,
        member.tapRelativePath,
        acquired.resolvedSha,
        source.ref,
        source.ref !== null,
        explicit,
        true,
      );
      items.push(...expansion.items);
      skipped.push(...expansion.skipped);
    }
    return { items, config, skipped };
  }

  const skill = candidate as Extract<typeof candidate, { kind: "skill" }>;
  const acquired = acquireTap(skill.tap, home);
  const expansion = expandSkillsAsItems(
    skill.location.path,
    skill.tap,
    skill.location.tapRelativePath,
    acquired.resolvedSha,
    source.ref,
    source.ref !== null,
    explicit,
    false,
  );
  return { items: expansion.items, config, skipped: expansion.skipped };
}
