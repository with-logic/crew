/**
 * Resolve a list of references into the install set: acquire sources,
 * validate skills, expand directories, and walk dependencies.
 *
 * This is the heart of `crew install` (§9 steps 1–6). The output is
 * every `ResolvedSkill` that must be staged and copied into targets,
 * plus an install-order guaranteed to place dependencies before dependents.
 */

import { CrewError } from "../core/errors.ts";
import { crewHome } from "../core/paths.ts";
import type { Config, LoadedSkill, MarkerSource, ResolvedSkill, Source } from "../core/types.ts";
import { parseRef } from "../refs/parse.ts";
import { acquireSource, type AcquiredSource } from "../sources/acquire.ts";
import { expandSkills } from "../sources/expand.ts";
import { stageIntoStore } from "../sources/store.ts";
import { isDirectory } from "../util/fs.ts";
import { hasSkillMd } from "../skill/load.ts";
import { join } from "node:path";

/** Options for resolution. */
export interface ResolveOptions {
  readonly cwd: string;
  readonly home: string;
}

/**
 * Resolve a list of references into a topologically-ordered install set.
 */
export function resolveInstallSet(refs: readonly string[], config: Config, options: Partial<ResolveOptions> = {}): ResolvedSkill[] {
  const cwd = options.cwd ?? process.cwd();
  const home = options.home ?? crewHome();

  // Records added by name so dependency re-entry is idempotent.
  const byName = new Map<string, ResolvedSkill>();
  // Queue of (skill, parent-context) pairs still to be processed.
  interface PendingResolution {
    readonly loaded: LoadedSkill;
    readonly markerSource: MarkerSource;
    readonly resolvedSha: string | null;
    readonly requestedRef: string | null;
    readonly pinned: boolean;
    readonly parentAcquired: AcquiredSource | null;
  }
  const pending: PendingResolution[] = [];

  // Step 1–5: resolve every root reference.
  for (const raw of refs) {
    const source = parseRef(raw, cwd);
    const acquired = acquireSource(source, config, home);
    const loadedList = expandSkills(acquired.rootDir);
    for (const loaded of loadedList) {
      const markerSource = markerSourceFor(acquired, source, loaded, acquired.rootDir);
      pending.push({
        loaded,
        markerSource,
        resolvedSha: acquired.resolvedSha,
        requestedRef: acquired.requestedRef,
        pinned: acquired.pinned,
        parentAcquired: acquired,
      });
    }
  }

  // Step 6: dependency walk. We do this breadth-first, processing each
  // pending skill: stage it, then for each dependency queue a new
  // `PendingResolution` if we don't already have it.
  const order: string[] = [];
  while (pending.length > 0) {
    const item = pending.shift()!;
    const name = item.loaded.frontmatter.name;
    if (byName.has(name)) {
      // Conflict check per §9 step 6 last paragraph.
      const existing = byName.get(name)!;
      if (existing.resolvedSha !== item.resolvedSha) {
        throw new CrewError(
          "conflicting_dependencies",
          `two skills named \`${name}\` resolve to different SHAs: ${existing.resolvedSha} vs ${item.resolvedSha}`,
        );
      }
      continue;
    }

    const staged = stageIntoStore(item.loaded.path, name, item.resolvedSha, home);
    const resolved: ResolvedSkill = {
      storePath: staged.storePath,
      name,
      frontmatter: item.loaded.frontmatter,
      markerSource: item.markerSource,
      ref: item.requestedRef,
      resolvedSha: item.resolvedSha,
      pinned: item.pinned,
      contentHash: staged.contentHash,
    };
    byName.set(name, resolved);
    order.push(name);

    // Enqueue dependencies (if any).
    const deps = item.loaded.frontmatter.metadata?.crew?.dependencies ?? [];
    for (const depRef of deps) {
      const depSource = parseRef(depRef, cwd);
      const resolvedDep = resolveDependency(depSource, depRef, item.parentAcquired, config, home);
      if (resolvedDep === null) continue;
      const { acquired, loaded, markerSource, effectiveSource } = resolvedDep;
      pending.push({
        loaded,
        markerSource,
        resolvedSha: acquired.resolvedSha,
        requestedRef: acquired.requestedRef,
        pinned: acquired.pinned,
        parentAcquired: acquired,
      });
      // Silence the unused-warning on `effectiveSource`.
      void effectiveSource;
    }
  }

  // Topological install order: dependencies installed before dependents.
  // We collected skills in an order where parents were enqueued before
  // their dependencies, so `order` is PARENT-first — we need to reverse
  // into dependency-first order. Do a proper topo sort.
  return topoSort(byName);
}

/** Topological sort: dependency before dependent. */
function topoSort(byName: Map<string, ResolvedSkill>): ResolvedSkill[] {
  const out: ResolvedSkill[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const names = [...byName.keys()];
  const deps = new Map<string, string[]>();
  for (const name of names) {
    const skill = byName.get(name)!;
    const depList = skill.frontmatter.metadata?.crew?.dependencies ?? [];
    deps.set(
      name,
      depList
        .map((d) => extractDepName(d))
        .filter((n): n is string => n !== null && byName.has(n)),
    );
  }

  function visit(name: string): void {
    if (visited.has(name)) return;
    if (visiting.has(name)) return; // cycle — terminate naturally per §9 step 6
    visiting.add(name);
    for (const d of deps.get(name) ?? []) {
      visit(d);
    }
    visiting.delete(name);
    visited.add(name);
    out.push(byName.get(name)!);
  }
  for (const name of names) visit(name);
  return out;
}

/**
 * Extract a best-guess dependency name from a reference string. Used only
 * to disambiguate when a directory-source expansion returns multiple
 * candidate skills. An indeterminate name returns `null`, which the
 * caller handles by falling back to the first candidate.
 */
function extractDepName(ref: string): string | null {
  const trimmed = ref.trim();
  // Bare tap name or `tap/name` (both may have an `@ref` tail).
  const bareOrQualified = trimmed.split("@")[0]!;
  const tail = bareOrQualified.split("/").pop() ?? "";
  if (/^[a-z][a-z0-9-]*$/.test(tail)) return tail;
  return null;
}

/** Resolve a dependency reference using §9 step 6's precedence. */
function resolveDependency(
  depSource: Source,
  originalRef: string,
  parent: AcquiredSource | null,
  config: Config,
  home: string,
): { acquired: AcquiredSource; loaded: LoadedSkill; markerSource: MarkerSource; effectiveSource: Source } | null {
  // Only bare-name tap references go through precedence.
  if (depSource.type === "tap" && depSource.tap === null) {
    // (1) sibling at the same source+ref is always tried first. For tap
    // sources this matches the "same tap" case because taps are flat at
    // the top level (every tap skill is a sibling of every other).
    if (parent) {
      const sibling = findSibling(parent, depSource.name);
      if (sibling) return sibling;
    }
    // (2) otherwise search all configured taps. `acquireSource` below
    // handles that via bare-tap resolution and raises
    // `ambiguous_reference` if multiple taps match.
  }

  const acquired = acquireSource(depSource, config, home);
  const list = expandSkills(acquired.rootDir);
  // A dependency reference names a single skill. `list.length === 1` is
  // the common case (the ref points straight at a skill directory). If
  // the resolved location expanded into multiple skills, prefer the one
  // whose name the ref names; otherwise take the first.
  const depName = extractDepName(originalRef);
  const matched = (depName && list.find((l) => l.frontmatter.name === depName)) || list[0]!;
  return {
    acquired,
    loaded: matched,
    markerSource: markerSourceFor(acquired, depSource, matched, acquired.rootDir),
    effectiveSource: depSource,
  };
}

/** Given a parent acquired source, look for a sibling skill by name. */
function findSibling(
  parent: AcquiredSource,
  depName: string,
): { acquired: AcquiredSource; loaded: LoadedSkill; markerSource: MarkerSource; effectiveSource: Source } | null {
  // A sibling is a directory at the same level as the parent's rootDir.
  // Only meaningful if rootDir is inside a parent directory whose own
  // siblings are skills.
  const parentOfParent = parent.rootDir.replace(/\/[^/]+$/, "");
  if (parentOfParent === parent.rootDir) return null;
  if (!isDirectory(parentOfParent)) return null;
  const candidate = join(parentOfParent, depName);
  if (!isDirectory(candidate) || !hasSkillMd(candidate)) return null;
  const { loadSkill } = require("../skill/load.ts") as typeof import("../skill/load.ts");
  const loaded = loadSkill(candidate);
  // Adopt the parent's resolution metadata (same repo, same SHA).
  const siblingMarkerSource = derivedSiblingMarker(parent.markerSource, parent.rootDir, candidate);
  const siblingAcquired: AcquiredSource = {
    rootDir: candidate,
    resolvedSha: parent.resolvedSha,
    requestedRef: parent.requestedRef,
    pinned: parent.pinned,
    markerSource: siblingMarkerSource,
    tapName: parent.tapName,
  };
  return {
    acquired: siblingAcquired,
    loaded,
    markerSource: siblingMarkerSource,
    effectiveSource: { type: "tap", tap: parent.tapName ?? null, name: depName, ref: null },
  };
}

/** Derive a marker source for a sibling that lives next to the original skill. */
function derivedSiblingMarker(parentMarker: MarkerSource, _parentRoot: string, siblingRoot: string): MarkerSource {
  switch (parentMarker.type) {
    case "tap":
      return { type: "tap", tap: parentMarker.tap, path: siblingRoot.split("/").pop() ?? parentMarker.path };
    case "git": {
      // Parent subpath's last segment was the original skill dir. Replace it.
      const newSub = siblingRoot.split("/").pop() ?? parentMarker.subpath;
      const prefix = parentMarker.subpath.split("/").slice(0, -1).join("/");
      const subpath = prefix.length > 0 ? `${prefix}/${newSub}` : newSub;
      return { type: "git", url: parentMarker.url, subpath };
    }
    case "path":
      return { type: "path", path: siblingRoot };
  }
}

/** Build a marker source for a skill loaded after directory expansion. */
function markerSourceFor(acquired: AcquiredSource, source: Source, loaded: LoadedSkill, acquiredRootDir: string): MarkerSource {
  // If the skill's path is deeper than rootDir (directory expansion case),
  // adjust the tap path / git subpath accordingly.
  const rel = loaded.path === acquiredRootDir ? "" : loaded.path.slice(acquiredRootDir.length + 1);
  if (source.type === "tap") {
    const tap = acquired.tapName ?? (source.tap ?? "");
    const path = rel.length > 0 ? `${source.name}/${rel}` : source.name;
    return { type: "tap", tap, path };
  }
  if (source.type === "git") {
    const subpath = rel.length > 0 ? (source.subpath.length > 0 ? `${source.subpath}/${rel}` : rel) : source.subpath;
    return { type: "git", url: source.url, subpath };
  }
  return { type: "path", path: loaded.path };
}
