/**
 * Acquire the on-disk contents for a tap (§9 step 2, §16).
 *
 * Every install attributes its skills to a tap (registered or auto).
 * `acquireTap` materializes that tap on disk:
 *
 *   - kind=git → `ensureClone` into `~/.crew/taps/<name>/`. No fetch
 *     by default (network policy: §16.6); the install flow that fetches
 *     does so explicitly via `refreshTaps` before calling here.
 *   - kind=path → just verify the directory exists.
 *
 * The result tells the caller where on disk to walk for skills, and
 * (for git taps) the resolved SHA to record on every state entry.
 *
 * The "find or create the tap that backs this install ref" logic lives
 * in `install/flow.ts` — by the time we get here, we already know which
 * tap to acquire.
 */

import { join } from "node:path";
import { CrewError } from "../../core/errors.ts";
import { crewHome, tapPath } from "../../core/paths.ts";
import type { TapConfig } from "../../core/types.ts";
import { ensureClone, resolveRef } from "../../git/repo.ts";
import { isDirectory } from "../../util/fs.ts";

/** Output of acquisition. */
export interface AcquiredTap {
  /** Absolute directory the tap is rooted at — walk this to find skills. */
  readonly rootDir: string;
  /** Full 40-char SHA for git taps; null for path taps. */
  readonly resolvedSha: string | null;
}

/** Materialize a tap on disk. Throws `source_unreachable` / `no_skills_found` on failure. */
export function acquireTap(tap: TapConfig, home: string = crewHome()): AcquiredTap {
  if (tap.kind === "path") {
    if (!isDirectory(tap.path)) {
      throw new CrewError(
        "no_skills_found",
        `tap \`${tap.name}\` points at \`${tap.path}\` which isn't a directory`,
        { tap: tap.name, path: tap.path },
      );
    }
    return { rootDir: tap.path, resolvedSha: null };
  }
  // kind === "git"
  const clonePath = tapPath(tap.name, home);
  ensureClone(tap.url, clonePath);
  const sha = resolveRef(clonePath, null);
  const rootDir = tap.subpath.length > 0 ? join(clonePath, tap.subpath) : clonePath;
  if (!isDirectory(rootDir)) {
    throw new CrewError(
      "no_skills_found",
      `tap \`${tap.name}\` subpath \`${tap.subpath}\` doesn't exist in ${tap.url} at ${sha.slice(0, 8)}`,
      { tap: tap.name, subpath: tap.subpath, sha },
    );
  }
  return { rootDir, resolvedSha: sha };
}

/** The directory that holds the tap's skills (after subpath, if any). */
export function tapRootDir(
  clonePath: string,
  tap: Pick<TapConfig, "kind" | "subpath" | "path">,
): string {
  if (tap.kind === "path") return tap.path;
  return tap.subpath.length > 0 ? join(clonePath, tap.subpath) : clonePath;
}
