/**
 * Enqueue helpers for the install resolver (§9).
 *
 * `resolveInstallSet` in `./index.ts` orchestrates the dependency
 * walk; the per-reference work (parsing, expansion, dependency-edge
 * handling) lives here to keep each file under the 200-line cap.
 *
 * Exports:
 *   - `PendingItem` — an in-flight entry the orchestrator holds.
 *   - `enqueueTapRef` — turn a `TapSource` into zero+ PendingItems.
 *   - `enqueueDep` — resolve a dependency reference (bare-name
 *     sibling, qualified, git URL, or path).
 *   - `expandSkillsAsItems` — map one directory to PendingItems.
 *   - `sourceRequestedRef` / `sourcePinned` — structural helpers.
 */

import type { Config, LoadedSkill, Source, TapConfig } from "../../core/types.ts";
import { parseRef } from "../../refs/parse.ts";
import { acquireTap } from "../../sources/acquire/index.ts";
import { expandSkills } from "../../sources/expand.ts";
import { findSiblingDep } from "../dep-resolution.ts";
import { type KindHint, resolveTapRef } from "../resolve-ref/index.ts";
import { attributeRef } from "../tap-attribution.ts";

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
): { items: PendingItem[]; config: Config } {
  // Whole-tap install short-circuit: bare `<name>` that is the name of
  // a configured tap. Cross-tap collisions (a same-named skill in a
  // DIFFERENT tap) are handled earlier in the CLI layer via
  // `detectCollision`; reaching this point means the CLI already
  // prompted or `--yes` was in play. Within-tap collisions (the same
  // name also being a skill in the matched tap) are rare and we
  // preserve the legacy "tap wins" behavior for back-compat.
  if (
    source.tap === null &&
    source.namespace === null &&
    (kindHint === "tap" || kindHint === null)
  ) {
    const matched = config.taps.find((c) => c.name === source.name);
    if (matched) {
      const acquired = acquireTap(matched, home);
      return {
        items: expandSkillsAsItems(
          acquired.rootDir,
          matched,
          "",
          acquired.resolvedSha,
          source.ref,
          source.ref !== null,
          explicit,
          true,
        ),
        config,
      };
    }
  }

  // Everything else runs through the resolver, which produces a
  // concrete NameCandidate (skill / namespace / tap) or throws.
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
    for (const member of candidate.members) {
      const member_items = expandSkillsAsItems(
        member.path,
        candidate.tap,
        member.tapRelativePath,
        acquired.resolvedSha,
        source.ref,
        source.ref !== null,
        explicit,
        true,
      );
      for (const it of member_items) items.push(it);
    }
    return { items, config };
  }

  // kind === "skill". The short-circuit above handles kind === "tap"
  // for bare names before we reach the resolver; other paths
  // (2-seg, 3-seg) never resolve to a tap.
  const skill = candidate as Extract<typeof candidate, { kind: "skill" }>;
  const acquired = acquireTap(skill.tap, home);
  const items = expandSkillsAsItems(
    skill.location.path,
    skill.tap,
    skill.location.tapRelativePath,
    acquired.resolvedSha,
    source.ref,
    source.ref !== null,
    explicit,
    false,
  );
  return { items, config };
}

/** Walk `dir` and produce one PendingItem per skill found (single or expanded). */
export function expandSkillsAsItems(
  dir: string,
  tap: TapConfig,
  baseTapPath: string,
  resolvedSha: string | null,
  requestedRef: string | null,
  pinned: boolean,
  explicit: boolean,
  tracksTap: boolean,
): PendingItem[] {
  const loaded = expandSkills(dir);
  const items: PendingItem[] = [];
  for (const l of loaded) {
    // tap-relative path of this skill's directory inside its tap.
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
  return items;
}

/** Resolve and enqueue items for a dependency reference. */
export function enqueueDep(
  depRef: string,
  parent: PendingItem,
  config: Config,
  cwd: string,
  home: string,
): { items: PendingItem[]; config: Config } {
  const source = parseRef(depRef, cwd);

  // Bare-name dep with a tap-aware parent: prefer a sibling in the parent's tap.
  if (source.type === "tap" && source.tap === null) {
    const sibling = findSiblingDep(
      { tap: parent.tap, tapRelativePath: parent.tapRelativePath },
      source.name,
      home,
    );
    if (sibling) {
      // Adopt the parent's resolution metadata (same tap clone, same SHA).
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
        config,
      };
    }
    // Fall through to bare-name search across all configured taps.
  }

  // Qualified tap ref or fallback bare name search.
  if (source.type === "tap") {
    return enqueueTapRef(source, config, home, false, null);
  }

  // Git or path dep ref. Not a whole-tap install — dep edges don't
  // subscribe the user to every sibling of the dep's source.
  const attrib = attributeRef(source, config);
  const acquired = acquireTap(attrib.tap, home);
  const items = expandSkillsAsItems(
    acquired.rootDir,
    attrib.tap,
    "",
    acquired.resolvedSha,
    sourceRequestedRef(source),
    sourcePinned(source, acquired.resolvedSha),
    false,
    false,
  );
  return { items, config: attrib.config };
}

export function sourceRequestedRef(source: Source): string | null {
  if (source.type === "git") return source.ref;
  if (source.type === "tap") return source.ref;
  return null;
}

export function sourcePinned(source: Source, resolvedSha: string | null): boolean {
  if (source.type !== "git") return false;
  if (source.ref === null) return false;
  // Without talking to git here (resolveRef happens in acquireTap and
  // doesn't currently classify), assume any explicit ref counts as
  // pinned. resolvedSha is unused in the heuristic but kept in the
  // signature for future use.
  void resolvedSha;
  return true;
}
