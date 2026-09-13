/**
 * Enqueue helpers for the install resolver (§9).
 *
 * `resolveInstallSet` in `./index.ts` orchestrates the dependency
 * walk; tap-reference expansion lives here to keep that orchestration
 * separate from reference resolution details.
 */

import { join } from "node:path";
import type { Config, LoadedSkill, TapConfig } from "../../core/types.ts";
import { withTapsAtRef } from "../../sources/acquire/at-ref.ts";
import { type AcquiredTap, withAcquiredTap } from "../../sources/acquire/index.ts";
import type { SkippedSkill } from "../../sources/expand.ts";
import type { StoredSkill } from "../../sources/store.ts";
import { type KindHint, resolveTapRef, type TapRoots } from "../resolve-ref/index.ts";
import { expandSkillsAsItems } from "./expand-items.ts";

/**
 * Where a candidate's skill directory lives in the acquired tree.
 *
 * Without a ref, `resolveTapRef` indexed the live clone and
 * `location.path` is absolute inside it. With a ref, resolution already
 * ran against the scratch export, but rebuilding from the tap-relative
 * path keeps this independent of which root produced the location
 * (§9 step 3).
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

  // With a ref, the named tap's commit is exported FIRST and resolution
  // runs against that tree: a skill present at `@v1` but deleted at HEAD
  // is invisible to an index of the live clone (§9 step 3).
  return withResolutionRoot(source, config, home, (roots, acquired) => {
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
      roots,
    );

    if (candidate.kind === "namespace") {
      const items: PendingItem[] = [];
      const skipped: SkippedSkill[] = [];
      const run = (acq: AcquiredTap): void => {
        for (const member of candidate.members) {
          const expansion = expandSkillsAsItems(
            memberDir(acq.rootDir, member, source.ref),
            candidate.tap,
            member.tapRelativePath,
            acq.resolvedSha,
            source.ref,
            acq.pinned,
            explicit,
            true,
            home,
          );
          items.push(...expansion.items);
          skipped.push(...expansion.skipped);
        }
      };
      if (acquired) run(acquired);
      else withAcquiredTap(candidate.tap, source.ref, home, run);
      return { items, config, skipped };
    }

    const skill = candidate as Extract<typeof candidate, { kind: "skill" }>;
    const expand = (acq: AcquiredTap) =>
      expandSkillsAsItems(
        memberDir(acq.rootDir, skill.location, source.ref),
        skill.tap,
        skill.location.tapRelativePath,
        acq.resolvedSha,
        source.ref,
        acq.pinned,
        explicit,
        false,
        home,
      );
    const expansion = acquired
      ? expand(acquired)
      : withAcquiredTap(skill.tap, source.ref, home, expand);
    return { items: expansion.items, config, skipped: expansion.skipped };
  });
}

/**
 * Run `fn` with the requested commit already materialized (§9 step 3).
 *
 * A qualified ref (`<tap>/<skill>@v1`, `<tap>/<ns>/<skill>@v1`) names its
 * tap directly, so one export precedes resolution and `fn` can reuse it
 * for expansion too.
 *
 * A BARE name with a ref names no tap, so every configured tap is
 * materialized at that ref before the name is matched: §9 step 3
 * requires resolution to read the requested commit, and a skill present
 * at `@v1` but deleted at the default branch is invisible to an index of
 * the live clone. `fn` gets the roots but no single `acquired`, because
 * which tap won isn't known until resolution returns; expansion then
 * acquires that tap itself.
 *
 * Without a ref there is nothing to export and the live clone is correct.
 */
function withResolutionRoot<T>(
  source: { tap: string | null; ref: string | null },
  config: Config,
  home: string,
  fn: (roots: TapRoots, acquired: AcquiredTap | null) => T,
): T {
  const ref = source.ref;
  if (ref === null) return fn({}, null);

  if (source.tap !== null) {
    const named = config.taps.find((t) => t.name === source.tap);
    if (!named) return fn({}, null);
    return withAcquiredTap(named, ref, home, (acquired) =>
      fn({ [named.name]: acquired.rootDir }, acquired),
    );
  }

  return withTapsAtRef(config.taps, ref, home, (roots) => fn(roots, null));
}
