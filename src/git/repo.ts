/**
 * Higher-level git operations crew uses: clone, fetch, resolve refs to
 * SHAs, classify a ref as tag/branch/sha, and list files at a given ref.
 *
 * Every external operation translates `GitProcessError` into crew's
 * `source_unreachable` / `ref_not_found` errors with appropriate exit
 * codes, so callers just catch `CrewError` and report.
 *
 * Network policy (§16.4): read-only commands (`crew search`, bare-name
 * `crew install`) call `ensureClone` — clones a missing tap the first
 * time, but never fetches. Only `crew update`, `crew tap update`, and
 * `crew install <git-url>` fetch upstream; they combine `ensureClone`
 * with `fetchAndCheckout` (or use the `ensureRepo` wrapper that bundles
 * both).
 *
 * `fetchRefs` is the variant that updates refs WITHOUT moving the
 * working tree: a ref-pinned acquisition needs the new objects but must
 * leave the shared clone where concurrent readers expect it (§9 step 3).
 *
 * Ref resolution and classification live in `./refs.ts`; they are
 * re-exported here so existing call sites keep one import path.
 */

import { CrewError } from "../core/errors.ts";
import { exists, isDirectory } from "../util/fs.ts";
import { type GitProcessError, runGit } from "./exec.ts";

export { classifyRef, resolveRef } from "./refs.ts";

/** Clone a repo into `dest`. Shallow unless `full` is true. */
export function cloneRepo(url: string, dest: string, full: boolean = false): void {
  try {
    const args = full ? ["clone", url, dest] : ["clone", "--no-single-branch", url, dest];
    runGit(args);
  } catch (err) {
    // `runGit` only ever throws `GitProcessError`, so this narrow is
    // safe. Translate to the user-facing error category.
    const ge = err as GitProcessError;
    throw new CrewError(
      "source_unreachable",
      `couldn't clone \`${url}\` — ${ge.result.stderr.trim()}`,
      { url },
    );
  }
}

/**
 * Clone `url` into `dest` if the clone doesn't already exist. Otherwise
 * verify the existing directory is a git repo. Never contacts the network
 * when the clone is already present — use `fetchAndCheckout` (or the
 * `ensureRepo` wrapper) to refresh it.
 *
 * Returns true if a clone was newly created, false if the existing
 * clone was reused.
 */
export function ensureClone(url: string, dest: string): boolean {
  if (!exists(dest)) {
    cloneRepo(url, dest);
    return true;
  }
  if (!isDirectory(`${dest}/.git`)) {
    throw new CrewError(
      "source_unreachable",
      `\`${dest}\` exists but isn't a git repository — something clobbered it outside crew's control; remove it and retry`,
      { dest },
    );
  }
  return false;
}

/**
 * Fetch upstream refs into an existing clone at `dest`, then fast-forward
 * the working tree to `origin/HEAD` (detached) so callers that read files
 * (e.g. `crew search`) see upstream additions. Assumes `dest` is already
 * a valid clone — callers pair this with `ensureClone`.
 */
export function fetchAndCheckout(dest: string): void {
  fetchRefs(dest);
  // Fast-forward the working tree to origin/HEAD. Failures here are
  // non-fatal — the fetched refs are still usable by `acquireSource`,
  // which resolves specific SHAs directly.
  const headSha = runGit(["rev-parse", "--verify", "refs/remotes/origin/HEAD^{commit}"], {
    cwd: dest,
    throwOnError: false,
  });
  if (headSha.exitCode === 0) {
    const sha = headSha.stdout.trim();
    if (/^[0-9a-f]{40}$/.test(sha)) {
      runGit(["checkout", "--quiet", "--detach", sha], { cwd: dest, throwOnError: false });
    }
  }
}

/**
 * Fetch upstream refs into `dest` WITHOUT touching its working tree.
 *
 * Ref-pinned acquisition needs this: it reads the requested commit out
 * of the object database, so moving the checkout would serve no purpose
 * and would corrupt the view of any concurrent `crew search` or install
 * reading the same shared clone.
 */
export function fetchRefs(dest: string): void {
  try {
    // `--force` so a tag that moved upstream moves here too; plain
    // `--tags` refuses to update a tag that already exists locally,
    // which would hide the "tag moved" case §10.1 step 3b describes.
    // `--prune-tags` so a tag DELETED upstream stops resolving here:
    // `--prune` alone only prunes remote-tracking branches, leaving a
    // vanished tag locally resolvable and letting `crew update` report
    // an entry up to date against a ref that no longer exists.
    runGit(["fetch", "--tags", "--force", "--prune", "--prune-tags", "origin"], { cwd: dest });
  } catch (err) {
    const ge = err as GitProcessError;
    throw new CrewError(
      "source_unreachable",
      `git fetch failed for the clone at \`${dest}\` — ${ge.result.stderr.trim()}`,
      { dest },
    );
  }
}

/**
 * Clone-if-missing AND fetch-if-present. Used by commands that both
 * materialize a new clone and want it refreshed in one shot: `crew update`
 * (every configured tap), `crew tap update`, and `crew install <git-url>`
 * (ad-hoc git sources, where the user expects the named ref to be fresh).
 */
export function ensureRepo(url: string, dest: string): boolean {
  const freshlyCloned = ensureClone(url, dest);
  if (freshlyCloned) {
    // Just cloned — already has the latest; skip the fetch round-trip.
    return true;
  }
  fetchAndCheckout(dest);
  return false;
}

/**
 * Check out a specific SHA into `repoPath`'s working tree. This is a
 * detached checkout so it doesn't interfere with any tracked branches.
 */
export function checkoutSha(repoPath: string, sha: string): void {
  try {
    runGit(["checkout", "--quiet", "--detach", sha], { cwd: repoPath });
  } catch (err) {
    const ge = err as GitProcessError;
    throw new CrewError(
      "ref_not_found",
      `couldn't check out ${sha.slice(0, 8)} — ${ge.result.stderr.trim()}`,
      { sha },
    );
  }
}

/** Initialize a fresh repo at `path` for test fixtures. */
export function initRepo(path: string): void {
  runGit(["init", "--quiet", "-b", "main", path]);
  runGit(["config", "user.email", "test@example.com"], { cwd: path });
  runGit(["config", "user.name", "Test"], { cwd: path });
  runGit(["config", "commit.gpgsign", "false"], { cwd: path });
  runGit(["config", "tag.gpgsign", "false"], { cwd: path });
}
