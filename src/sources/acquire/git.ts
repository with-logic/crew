/**
 * Git-source acquisition: clone/fetch the repo into `~/.crew/cache/`,
 * check out the resolved SHA, and point `rootDir` at the (optional)
 * subpath within the tree.
 */

import { join } from "node:path";
import { CrewError } from "../../core/errors.ts";
import { crewHome, paths } from "../../core/paths.ts";
import type { GitSource } from "../../core/types.ts";
import { checkoutSha, classifyRef, ensureRepo, resolveRef } from "../../git/repo.ts";
import { ensureDir, isDirectory } from "../../util/fs.ts";
import type { AcquiredSource } from "./index.ts";

/** Clone/fetch a git source and check out its resolved SHA. */
export function acquireGit(source: GitSource, home: string = crewHome()): AcquiredSource {
  const cacheDir = gitCachePath(source, home);
  ensureRepo(source.url, cacheDir);
  const sha = resolveRef(cacheDir, source.ref);
  const kind = classifyRef(cacheDir, source.ref);
  // Reset the checkout to the resolved SHA so the working tree matches it.
  checkoutSha(cacheDir, sha);

  const rootDir = source.subpath.length > 0 ? join(cacheDir, source.subpath) : cacheDir;
  if (!isDirectory(rootDir)) {
    throw new CrewError(
      "no_skills_found",
      `subpath \`${source.subpath}\` doesn't exist in ${source.url} at ${sha.slice(0, 8)}`,
      { url: source.url, subpath: source.subpath, sha },
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
