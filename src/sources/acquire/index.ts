/**
 * Acquire the on-disk contents for a source (§9 step 2).
 *
 * The output of acquisition is an `AcquiredSource`:
 *
 *   - `rootDir` — absolute path to a directory on disk. Either points
 *     directly at a skill (contains `SKILL.md`) or at a container to be
 *     walked one level deep (§9 step 5).
 *   - `resolvedSha` — the 40-char commit SHA for git/tap sources; null
 *     for path sources that were never in git.
 *   - `pinned` — whether the install counts as pinned (ref was a tag or
 *     exact SHA).
 *   - `markerSource` — what the marker's `source` field should record.
 *
 * Per-source-type acquisition lives in sibling modules: `./git.ts` and
 * `./tap.ts`. This file holds the shared result type, the trivial path
 * acquirer, and the dispatcher.
 */

import { CrewError } from "../../core/errors.ts";
import { crewHome } from "../../core/paths.ts";
import type { Config, MarkerSource, PathSource, Source } from "../../core/types.ts";
import { isDirectory } from "../../util/fs.ts";
import { acquireGit } from "./git.ts";
import { acquireTap } from "./tap.ts";

/** Output of acquisition. */
export interface AcquiredSource {
  /** Directory to be treated as a skill OR a container of skills. */
  readonly rootDir: string;
  /** Full 40-char SHA, or null for path sources. */
  readonly resolvedSha: string | null;
  /** The ref the user asked for (unresolved), or null if default branch. */
  readonly requestedRef: string | null;
  /** Whether the installed skills should be marked pinned. */
  readonly pinned: boolean;
  /** Marker source to record. */
  readonly markerSource: MarkerSource;
  /** For tap sources, the tap they came from. */
  readonly tapName?: string;
}

/** Resolve a path source (simplest case). */
export function acquirePath(source: PathSource): AcquiredSource {
  if (!isDirectory(source.path)) {
    throw new CrewError("no_skills_found", `\`${source.path}\` isn't a directory`, {
      path: source.path,
    });
  }
  return {
    rootDir: source.path,
    resolvedSha: null,
    requestedRef: null,
    pinned: false,
    markerSource: { type: "path", path: source.path },
  };
}

/** Dispatch acquisition based on source kind. */
export function acquireSource(
  source: Source,
  config: Config,
  home: string = crewHome(),
): AcquiredSource {
  switch (source.type) {
    case "path":
      return acquirePath(source);
    case "git":
      return acquireGit(source, home);
    case "tap":
      return acquireTap(source, config, home);
  }
}

// Re-export per-kind acquirers for callers that want them directly.
export { acquireGit, gitCachePath } from "./git.ts";
export { acquireTap } from "./tap.ts";
