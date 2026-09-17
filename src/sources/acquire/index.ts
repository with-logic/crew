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
import { ensureClone } from "../../git/repo/index.ts";
import { resolveRef } from "../../git/repo/refs.ts";
import { isDirectory } from "../../util/fs.ts";
import { assertNoSymlinkEscape } from "../../util/symlink-containment.ts";

/** Output of acquisition. */
export interface AcquiredTap {
  /** Absolute directory the tap is rooted at — walk this to find skills. */
  readonly rootDir: string;
  /** Full 40-char SHA for git taps; null for path taps. */
  readonly resolvedSha: string | null;
}

/**
 * Materialize a tap on disk. Throws `source_unreachable` when the clone
 * cannot be obtained, `no_skills_found` when the subpath doesn't exist,
 * and `invalid_ref` when the stored subpath escapes the clone (see
 * `tapRootDir`).
 */
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
  // `tapRootDir` proves containment (lexical + symlink) as it resolves.
  const rootDir = tapRootDir(clonePath, tap);
  if (!isDirectory(rootDir)) {
    throw new CrewError(
      "no_skills_found",
      `tap \`${tap.name}\` subpath \`${tap.subpath}\` doesn't exist in ${tap.url} at ${sha.slice(0, 8)}`,
      { tap: tap.name, subpath: tap.subpath, sha },
    );
  }
  return { rootDir, resolvedSha: sha };
}

/**
 * The directory that holds the tap's skills (after subpath, if any).
 *
 * Containment is enforced here rather than at each call site, because
 * this is the single place a stored subpath becomes a real location.
 * `config.yaml` is read back from disk without passing through the
 * reference parser, so a hand-edited `../…` or a subpath that became a
 * symlink after `tap add` would otherwise reach discovery unchecked —
 * install validated it, but `crew search` and `crew info` index taps
 * through their own path.
 */
export function tapRootDir(
  clonePath: string,
  tap: Pick<TapConfig, "kind" | "subpath" | "path" | "name">,
): string {
  if (tap.kind === "path") return tap.path;
  if (tap.subpath.length === 0) return clonePath;
  const rootDir = join(clonePath, tap.subpath);
  assertNoSymlinkEscape(clonePath, rootDir, `tap \`${tap.name}\` subpath \`${tap.subpath}\``);
  return rootDir;
}
