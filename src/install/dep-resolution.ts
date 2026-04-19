/**
 * Dependency resolution helpers for the install set walker (§9 step 6).
 *
 * When a skill declares `metadata.crew.dependencies`, the walker asks
 * this module to take a dependency reference and produce enough state
 * to enqueue it: the acquired source, the loaded skill, and the marker
 * source to record.
 *
 * Precedence for bare-name tap references is: (1) a sibling at the same
 * source + ref (matters when the parent came from a multi-skill git
 * repo, since "install this sibling from the same commit" is much
 * stricter than "install a skill of this name from any configured tap");
 * (2) fall through to normal tap resolution, which raises
 * `ambiguous_reference` if multiple taps match.
 *
 * `markerSourceFor` / `derivedSiblingMarker` also live here because the
 * "what does the marker file record" question is entangled with where
 * in the acquired tree a skill was loaded from.
 */

import { join } from "node:path";
import type { LoadedSkill, MarkerSource, Source } from "../core/types.ts";
import { hasSkillMd } from "../skill/load.ts";
import type { AcquiredSource } from "../sources/acquire/index.ts";
import { expandSkills } from "../sources/expand.ts";
import { isDirectory } from "../util/fs.ts";
import { extractDepName } from "./topo.ts";

/** Shape returned by every resolver in this module. */
interface ResolvedDep {
  readonly acquired: AcquiredSource;
  readonly loaded: LoadedSkill;
  readonly markerSource: MarkerSource;
  readonly effectiveSource: Source;
}

/** Resolve a dependency reference using §9 step 6's precedence. */
export function resolveDependency(
  depSource: Source,
  originalRef: string,
  parent: AcquiredSource | null,
  acquire: (s: Source) => AcquiredSource,
): ResolvedDep | null {
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

  const acquired = acquire(depSource);
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
function findSibling(parent: AcquiredSource, depName: string): ResolvedDep | null {
  // A sibling is a directory at the same level as the parent's rootDir.
  // Only meaningful if rootDir is inside a parent directory whose own
  // siblings are skills.
  const parentOfParent = parent.rootDir.replace(/\/[^/]+$/, "");
  if (parentOfParent === parent.rootDir) return null;
  if (!isDirectory(parentOfParent)) return null;
  const candidate = join(parentOfParent, depName);
  if (!(isDirectory(candidate) && hasSkillMd(candidate))) return null;
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
    ...(parent.tapName === undefined ? {} : { tapName: parent.tapName }),
  };
  return {
    acquired: siblingAcquired,
    loaded,
    markerSource: siblingMarkerSource,
    effectiveSource: { type: "tap", tap: parent.tapName ?? null, name: depName, ref: null },
  };
}

/** Derive a marker source for a sibling that lives next to the original skill. */
function derivedSiblingMarker(
  parentMarker: MarkerSource,
  _parentRoot: string,
  siblingRoot: string,
): MarkerSource {
  switch (parentMarker.type) {
    case "tap":
      return {
        type: "tap",
        tap: parentMarker.tap,
        path: siblingRoot.split("/").pop() ?? parentMarker.path,
      };
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
export function markerSourceFor(
  acquired: AcquiredSource,
  source: Source,
  loaded: LoadedSkill,
  acquiredRootDir: string,
): MarkerSource {
  // If the skill's path is deeper than rootDir (directory expansion case),
  // adjust the tap path / git subpath accordingly.
  const rel = loaded.path === acquiredRootDir ? "" : loaded.path.slice(acquiredRootDir.length + 1);
  if (source.type === "tap") {
    const tap = acquired.tapName ?? source.tap ?? "";
    const path = rel.length > 0 ? `${source.name}/${rel}` : source.name;
    return { type: "tap", tap, path };
  }
  if (source.type === "git") {
    const subpath =
      rel.length > 0
        ? source.subpath.length > 0
          ? `${source.subpath}/${rel}`
          : rel
        : source.subpath;
    return { type: "git", url: source.url, subpath };
  }
  return { type: "path", path: loaded.path };
}
