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
 */

import { join } from "node:path";
import { CrewError } from "../core/errors.ts";
import { crewHome, paths, tapPath } from "../core/paths.ts";
import type {
  Config,
  GitSource,
  MarkerSource,
  PathSource,
  Source,
  TapSource,
} from "../core/types.ts";
import { classifyRef, ensureRepo, resolveRef } from "../git/repo.ts";
import { ensureDir, isDirectory } from "../util/fs.ts";

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
    throw new CrewError("no_skills_found", `path source is not a directory: ${source.path}`);
  }
  return {
    rootDir: source.path,
    resolvedSha: null,
    requestedRef: null,
    pinned: false,
    markerSource: { type: "path", path: source.path },
  };
}

/** Clone/fetch a git source and check out its resolved SHA. */
export function acquireGit(source: GitSource, home: string = crewHome()): AcquiredSource {
  const cacheDir = gitCachePath(source, home);
  ensureRepo(source.url, cacheDir);
  const sha = resolveRef(cacheDir, source.ref);
  const kind = classifyRef(cacheDir, source.ref);
  // Reset the checkout to the resolved SHA so the working tree matches it.
  const { checkoutSha } = require("../git/repo.ts") as typeof import("../git/repo.ts");
  checkoutSha(cacheDir, sha);

  const rootDir = source.subpath.length > 0 ? join(cacheDir, source.subpath) : cacheDir;
  if (!isDirectory(rootDir)) {
    throw new CrewError(
      "no_skills_found",
      `subpath ${source.subpath} not found in ${source.url}@${sha}`,
    );
  }
  return {
    rootDir,
    resolvedSha: sha,
    requestedRef: source.ref,
    pinned: kind === "sha" || kind === "tag",
    markerSource: { type: "git", url: source.url, subpath: source.subpath },
  };
}

/** Acquire a tap source, from a specified tap or by searching all taps. */
export function acquireTap(
  source: TapSource,
  config: Config,
  home: string = crewHome(),
): AcquiredSource {
  if (source.tap !== null) {
    const tapConfig = config.taps.find((t) => t.name === source.tap);
    if (!tapConfig) throw new CrewError("invalid_ref", `tap \`${source.tap}\` is not configured`);
    return acquireFromTap(tapConfig.name, tapConfig.url, source, home);
  }

  // Bare name: search every tap.
  const found: { tapName: string; tapUrl: string }[] = [];
  for (const tap of config.taps) {
    const tp = tapPath(tap.name, home);
    ensureRepo(tap.url, tp);
    if (isDirectory(join(tp, source.name))) {
      found.push({ tapName: tap.name, tapUrl: tap.url });
    }
  }
  if (found.length === 0)
    throw new CrewError("invalid_ref", `skill \`${source.name}\` not found in any tap`);
  if (found.length > 1) {
    const candidates = found.map((f) => `${f.tapName}/${source.name}`).join(", ");
    throw new CrewError(
      "ambiguous_reference",
      `skill \`${source.name}\` is ambiguous; candidates: ${candidates}`,
      {
        candidates,
      },
    );
  }
  return acquireFromTap(found[0]!.tapName, found[0]!.tapUrl, source, home);
}

function acquireFromTap(
  tapName: string,
  tapUrl: string,
  source: TapSource,
  home: string,
): AcquiredSource {
  const tp = tapPath(tapName, home);
  ensureRepo(tapUrl, tp);
  const sha = resolveRef(tp, source.ref);
  const kind = classifyRef(tp, source.ref);
  const { checkoutSha } = require("../git/repo.ts") as typeof import("../git/repo.ts");
  checkoutSha(tp, sha);

  const relative = source.name;
  const rootDir = join(tp, relative);
  if (!isDirectory(rootDir)) {
    throw new CrewError("invalid_ref", `skill \`${source.name}\` not found in tap \`${tapName}\``);
  }
  return {
    rootDir,
    resolvedSha: sha,
    requestedRef: source.ref,
    pinned: kind === "sha" || kind === "tag",
    markerSource: { type: "tap", tap: tapName, path: relative },
    tapName,
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

/** Compute where an ad-hoc git source is cached (§6). */
export function gitCachePath(source: GitSource, home: string = crewHome()): string {
  const hostPart = urlToHostOwnerRepo(source.url);
  const refPart = source.ref ?? "HEAD";
  const dir = join(paths(home).gitCacheDir, hostPart, sanitizeSegment(refPart));
  // Ensure the parent exists so `git clone` can create `dir`. Do NOT create
  // `dir` itself; git clone fails if its destination already exists.
  ensureDir(join(dir, ".."));
  return dir;
}

/**
 * Convert a canonical git URL to a filesystem-safe `host/owner/repo`
 * key. `parseRef` only produces URLs that match one of the four shapes
 * below, so the final unconditional return is a total fallback for any
 * future shapes that get added.
 */
function urlToHostOwnerRepo(url: string): string {
  // https://host/owner/repo[.git] → host/owner/repo
  let m = url.match(/^https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (m) return `${m[1]!}/${m[2]!}`;
  // ssh://[user@]host[:port]/owner/repo[.git] → host/owner/repo
  m = url.match(/^ssh:\/\/(?:[^@]+@)?([^:/]+)(?::\d+)?\/(.+?)(?:\.git)?$/);
  if (m) return `${m[1]!}/${m[2]!}`;
  // git@host:owner/repo[.git] → host/owner/repo
  m = url.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  if (m) return `${m[1]!}/${m[2]!}`;
  // file:///abs/path → file/<sanitized-abs-path>. The regex is total
  // over `file://*` so the match always succeeds here.
  m = url.match(/^file:\/\/(.+?)(?:\.git)?$/)!;
  return `file/${sanitizeSegment(m[1]!)}`;
}

function sanitizeSegment(s: string): string {
  return s.replace(/[^A-Za-z0-9._@/-]/g, "_");
}
