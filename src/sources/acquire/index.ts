/**
 * Acquire the on-disk contents for a tap (§9 step 2-3, §16).
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
 * **Refs.** When the caller passes a `ref` (from an `@<tag|branch|sha>`
 * tail), that ref — not the clone's checked-out `HEAD` — decides both
 * the recorded SHA and the bytes the caller reads. Since the clone is
 * shared, the content is exported to a scratch directory rather than
 * checked out in place; `withAcquiredTap` scopes that directory to the
 * callback and deletes it afterwards. `acquireTap` without a ref is
 * unchanged and needs no cleanup.
 *
 * The "find or create the tap that backs this install ref" logic lives
 * in `install/flow.ts` — by the time we get here, we already know which
 * tap to acquire.
 */

import { join, posix } from "node:path";
import { CrewError } from "../../core/errors.ts";
import { crewHome, tapPath } from "../../core/paths.ts";
import type { TapConfig } from "../../core/types.ts";
import { withExportedTree } from "../../git/export.ts";
import { classifyRef, ensureClone, fetchRefs, resolveRef } from "../../git/repo.ts";
import { isDirectory } from "../../util/fs.ts";

/** Output of acquisition. */
export interface AcquiredTap {
  /** Absolute directory the tap is rooted at — walk this to find skills. */
  readonly rootDir: string;
  /** Full 40-char SHA for git taps; null for path taps. */
  readonly resolvedSha: string | null;
  /**
   * True when the requested ref names an immutable revision — a SHA or
   * a tag (§11.1). A branch, or no ref at all, is not pinned.
   */
  readonly pinned: boolean;
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
    return { rootDir: tap.path, resolvedSha: null, pinned: false };
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
  return { rootDir, resolvedSha: sha, pinned: false };
}

/**
 * Acquire a tap at `ref` and run `fn` against the result.
 *
 * With a null `ref` (or a path-kind tap, which has no commits) this is
 * exactly `acquireTap` and `fn` sees the live clone. With a ref, the
 * commit is resolved first — an unknown ref is `ref_not_found` (exit 5,
 * §13) — and `fn` sees a scratch export of that commit that is deleted
 * when `fn` returns or throws.
 */
export function withAcquiredTap<T>(
  tap: TapConfig,
  ref: string | null,
  home: string,
  fn: (acquired: AcquiredTap) => T,
): T {
  if (ref === null || tap.kind === "path") {
    return fn(acquireTap(tap, home));
  }
  const clonePath = tapPath(tap.name, home);
  ensureClone(tap.url, clonePath);
  const sha = resolveRefFetchingIfNeeded(clonePath, ref);
  const kind = classifyRef(clonePath, ref);
  const pinned = kind === "sha" || kind === "tag";
  return withExportedTree(clonePath, sha, tap.subpath, home, (rootDir) =>
    fn({ rootDir, resolvedSha: sha, pinned }),
  );
}

/**
 * Acquire only ONE skill's subtree of a tap at `ref`.
 *
 * `crew update` reads exactly `<tap root>/<entry source path>` per entry.
 * For a whole-repo tap (`subpath` empty) the general `withAcquiredTap`
 * would export the entire repository for each such entry — N full
 * exports for N skills sharing a tap and ref. Narrowing the export to
 * the skill's own path makes that cost proportional to what is read
 * (§10.1).
 *
 * `fn` receives the skill directory itself, not the tap root.
 */
export function withAcquiredSkillDir<T>(
  tap: TapConfig,
  ref: string | null,
  skillPath: string,
  home: string,
  fn: (acquired: AcquiredTap, skillDir: string) => T,
): T {
  if (ref === null || tap.kind === "path") {
    const acquired = acquireTap(tap, home);
    return fn(acquired, join(acquired.rootDir, skillPath));
  }
  const clonePath = tapPath(tap.name, home);
  ensureClone(tap.url, clonePath);
  const sha = resolveRefFetchingIfNeeded(clonePath, ref);
  const kind = classifyRef(clonePath, ref);
  const pinned = kind === "sha" || kind === "tag";
  const exportPath =
    skillPath.length === 0
      ? tap.subpath
      : tap.subpath.length > 0
        ? posix.join(tap.subpath, skillPath)
        : skillPath;
  return withExportedTree(clonePath, sha, exportPath, home, (skillDir) =>
    fn({ rootDir: skillDir, resolvedSha: sha, pinned }, skillDir),
  );
}

/**
 * Resolve `ref` in the clone, fetching once if it isn't there yet — a
 * tag published after the clone was made is the common case. A ref that
 * is still missing after the fetch is `ref_not_found` (exit 5).
 *
 * Only a genuinely missing ref triggers the retry. A repository or
 * process failure means something else is wrong, and swallowing it here
 * would report "no such ref" for a broken clone.
 *
 * The fetch updates refs WITHOUT checking anything out: the commit is
 * read from the object database, and the shared clone's working tree
 * must stay where concurrent readers expect it (§9 step 3).
 */
function resolveRefFetchingIfNeeded(clonePath: string, ref: string): string {
  try {
    return resolveRef(clonePath, ref);
  } catch (err) {
    if (!(err instanceof CrewError && err.code === "ref_not_found")) throw err;
    fetchRefs(clonePath);
    return resolveRef(clonePath, ref);
  }
}

/** The directory that holds the tap's skills (after subpath, if any). */
export function tapRootDir(
  clonePath: string,
  tap: Pick<TapConfig, "kind" | "subpath" | "path">,
): string {
  if (tap.kind === "path") return tap.path;
  return tap.subpath.length > 0 ? join(clonePath, tap.subpath) : clonePath;
}
