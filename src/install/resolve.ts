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

import { join } from "node:path";
import { CrewError } from "../core/errors.ts";
import { crewHome } from "../core/paths.ts";
import type { Config, LoadedSkill, ResolvedSkill, Source, TapConfig } from "../core/types.ts";
import { parseRef } from "../refs/parse.ts";
import { acquireTap } from "../sources/acquire/index.ts";
import { expandSkills } from "../sources/expand.ts";
import { stageIntoStore } from "../sources/store.ts";
import { findTapForBareName } from "./attribute-bare-name.ts";
import { findSiblingDep } from "./dep-resolution.ts";
import { attributeRef } from "./tap-attribution.ts";
import { topoSort } from "./topo.ts";

/** Options for resolution. */
export interface ResolveOptions {
  readonly cwd: string;
  readonly home: string;
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

  let config = startingConfig;
  const byName = new Map<string, ResolvedSkill>();
  const requiredBy: RequiredByMap = new Map();
  const pending: PendingItem[] = [];

  // Step 1–5: resolve every root reference.
  for (const raw of refs) {
    const enqueued = enqueueRoot(raw, config, cwd, home);
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
): { items: PendingItem[]; config: Config } {
  const source = parseRef(raw, cwd);

  // Bare-name (`<skill>`) and qualified (`<tap>/<skill>`) tap refs.
  if (source.type === "tap") {
    return enqueueTapRef(source, config, home, true);
  }

  // Git URL or path: find or create the tap.
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
  );
  return { items, config: attrib.config };
}

/** Resolve a `tap-name` or `tap-name/skill` ref into items. */
function enqueueTapRef(
  source: { tap: string | null; name: string; ref: string | null },
  config: Config,
  home: string,
  explicit: boolean,
): { items: PendingItem[]; config: Config } {
  // Two cases:
  //   - source.tap !== null  → user typed `<tap>/<skill>`
  //   - source.tap === null  → user typed `<name>`. Could be a tap
  //     name or a skill name; tap takes precedence per §16.4.
  let tap: TapConfig;
  let skillName: string;
  if (source.tap === null) {
    // Bare name. The disambiguation is handled by the caller (CLI
    // command) for top-level installs; here we treat a bare name as a
    // skill name first, falling back to "tap" only when the name
    // matches a tap and nothing else.
    const matched = config.taps.find((c) => c.name === source.name);
    if (matched) {
      // Whole-tap install.
      tap = matched;
      const acquired = acquireTap(tap, home);
      return {
        items: expandSkillsAsItems(
          acquired.rootDir,
          tap,
          "",
          acquired.resolvedSha,
          source.ref,
          source.ref !== null,
          explicit,
        ),
        config,
      };
    }
    tap = findTapForBareName(source.name, config, home);
    skillName = source.name;
  } else {
    const t = config.taps.find((c) => c.name === source.tap);
    if (!t)
      throw new CrewError(
        "invalid_ref",
        `no tap named \`${source.tap}\` is configured — run \`crew tap list\` to see configured taps, or \`crew tap add\` to add one`,
        { tap: source.tap },
      );
    tap = t;
    skillName = source.name;
  }
  // Attribute to a single skill within the tap.
  const acquired = acquireTap(tap, home);
  const skillDir = join(acquired.rootDir, skillName);
  const items = expandSkillsAsItems(
    skillDir,
    tap,
    skillName,
    acquired.resolvedSha,
    source.ref,
    source.ref !== null,
    explicit,
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
          },
        ],
        config,
      };
    }
    // Fall through to bare-name search across all configured taps.
  }

  // Qualified tap ref or fallback bare name search.
  if (source.type === "tap") {
    const enqueued = enqueueTapRef(source, config, home, false);
    return enqueued;
  }

  // Git or path dep ref.
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
