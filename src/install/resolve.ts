/**
 * Resolve a list of references into the install set: attribute each ref
 * to a tap (creating auto-taps as needed), acquire the tap on disk,
 * expand directories, and walk dependencies.
 *
 * Output:
 *   - every `ResolvedSkill` to install (topologically ordered: deps
 *     before dependents);
 *   - a `requiredBy` map for `state.required_by` maintenance;
 *   - the (possibly extended) `Config` reflecting any auto-taps the
 *     resolution created — the caller persists it under the state lock.
 *
 * Every install attributes its skills to exactly one tap (§16.5).
 */

import { CrewError } from "../core/errors.ts";
import { crewHome } from "../core/paths.ts";
import type { Config, LoadedSkill, ResolvedSkill, Source, TapConfig } from "../core/types.ts";
import { parseRef } from "../refs/parse.ts";
import { acquireTap } from "../sources/acquire/index.ts";
import { expandSkills } from "../sources/expand.ts";
import { stageIntoStore } from "../sources/store.ts";
import { findSiblingDep } from "./dep-resolution.ts";
import type { KindHint } from "./resolve-ref/index.ts";
import { resolveTapRef } from "./resolve-ref/index.ts";
import { attributeRef } from "./tap-attribution.ts";
import { topoSort } from "./topo.ts";

/** Options for resolution. */
export interface ResolveOptions {
  readonly cwd: string;
  readonly home: string;
  /**
   * Optional force-one-kind hint for bare-name / 2-segment refs. Set
   * by `--tap` / `--bundle` / `--skill` on the CLI. Applies to every
   * root ref; dependencies never see a hint.
   */
  readonly kindHint: KindHint;
}

/** name → set of names that depend on it. */
export type RequiredByMap = Map<string, Set<string>>;

/** Output of resolution. */
export interface ResolveResult {
  readonly skills: readonly ResolvedSkill[];
  readonly requiredBy: RequiredByMap;
  /** Config including any auto-taps we created. Caller writes it. */
  readonly config: Config;
}

interface PendingItem {
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

/**
 * Resolve a list of references into a topologically-ordered install set.
 */
export function resolveInstallSet(
  refs: readonly string[],
  startingConfig: Config,
  options: Partial<ResolveOptions> = {},
): ResolveResult {
  const cwd = options.cwd ?? process.cwd();
  const home = options.home ?? crewHome();
  const kindHint: KindHint = options.kindHint ?? null;

  let config = startingConfig;
  const byName = new Map<string, ResolvedSkill>();
  const requiredBy: RequiredByMap = new Map();
  const pending: PendingItem[] = [];

  // Step 1–5: resolve every root reference.
  for (const raw of refs) {
    const enqueued = enqueueRoot(raw, config, cwd, home, kindHint);
    config = enqueued.config;
    pending.push(...enqueued.items);
  }

  // Step 6: dependency walk.
  while (pending.length > 0) {
    const item = pending.shift()!;
    const name = item.loaded.frontmatter.name;
    if (byName.has(name)) {
      const existing = byName.get(name)!;
      if (existing.resolvedSha !== item.resolvedSha)
        throw new CrewError(
          "conflicting_dependencies",
          `\`${name}\` appears twice in this install set with different SHAs (${(existing.resolvedSha ?? "<null>").slice(0, 8)} vs ${(item.resolvedSha ?? "<null>").slice(0, 8)}) — pin one to a specific version, or install them separately`,
          { name, existing: existing.resolvedSha, incoming: item.resolvedSha },
        );
      continue;
    }

    const staged = stageIntoStore(item.loaded.path, name, item.resolvedSha, home);
    byName.set(name, {
      storePath: staged.storePath,
      name,
      frontmatter: item.loaded.frontmatter,
      tap: item.tap,
      tapRelativePath: item.tapRelativePath,
      ref: item.requestedRef,
      resolvedSha: item.resolvedSha,
      pinned: item.pinned,
      contentHash: staged.contentHash,
      explicit: item.explicit,
      tracksTap: item.tracksTap,
    });

    // Enqueue dependencies (if any).
    const deps = item.loaded.frontmatter.metadata?.crew?.dependencies ?? [];
    for (const depRef of deps) {
      const enqueued = enqueueDep(depRef, item, config, cwd, home);
      config = enqueued.config;
      for (const depItem of enqueued.items) {
        pending.push(depItem);
        const depName = depItem.loaded.frontmatter.name;
        if (!requiredBy.has(depName)) requiredBy.set(depName, new Set());
        requiredBy.get(depName)!.add(name);
      }
    }
  }

  return { skills: topoSort(byName), requiredBy, config };
}

/** Resolve and enqueue the items produced by a single root reference. */
function enqueueRoot(
  raw: string,
  config: Config,
  cwd: string,
  home: string,
  kindHint: KindHint,
): { items: PendingItem[]; config: Config } {
  const source = parseRef(raw, cwd);

  // Bare-name (`<skill>`) and qualified (`<tap>/<skill>`, `<tap>/<ns>/<skill>`) tap refs.
  if (source.type === "tap") {
    return enqueueTapRef(source, config, home, true, kindHint);
  }

  // Git URL or path: find or create the tap. This is always a
  // whole-tap install — the user pointed at a folder (or repo) and
  // said "install this". Future additions should follow.
  const attrib = attributeRef(source, config);
  const acquired = acquireTap(attrib.tap, home);
  const items = expandSkillsAsItems(
    acquired.rootDir,
    attrib.tap,
    "",
    acquired.resolvedSha,
    sourceRequestedRef(source),
    sourcePinned(source, acquired.resolvedSha),
    true,
    true,
  );
  return { items, config: attrib.config };
}

/** Resolve a tap/namespace/skill ref into items. */
function enqueueTapRef(
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
function expandSkillsAsItems(
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
function enqueueDep(
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
    const enqueued = enqueueTapRef(source, config, home, false, null);
    return enqueued;
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

function sourceRequestedRef(source: Source): string | null {
  if (source.type === "git") return source.ref;
  if (source.type === "tap") return source.ref;
  return null;
}

function sourcePinned(source: Source, resolvedSha: string | null): boolean {
  if (source.type !== "git") return false;
  if (source.ref === null) return false;
  // Without talking to git here (resolveRef happens in acquireTap and
  // doesn't currently classify), assume any explicit ref counts as
  // pinned. The tap layer doesn't track pinning today since taps
  // always follow default branch; per-skill ref pinning is preserved
  // only on git URL installs that name a ref. resolvedSha is unused
  // in the heuristic but kept in the signature for future use.
  void resolvedSha;
  return true;
}
