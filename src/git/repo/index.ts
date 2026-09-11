/**
 * Higher-level git operations crew uses to obtain a repository: clone,
 * fetch, and the `ensureClone` / `ensureRepo` wrappers. Ref resolution
 * and checkout live in `./refs.ts`.
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
 */

import { CrewError } from "../../core/errors.ts";
import { exists, isDirectory } from "../../util/fs.ts";
import { type GitProcessError, runGit } from "../exec.ts";

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
  try {
    // `--force` so a tag that moved upstream moves here too; plain
    // `--tags` refuses to update a tag that already exists locally,
    // which would hide the "tag moved" case §10.1 step 3b describes.
    runGit(["fetch", "--tags", "--force", "--prune", "origin"], { cwd: dest });
  } catch (err) {
    const ge = err as GitProcessError;
    throw new CrewError(
      "source_unreachable",
      `git fetch failed for the clone at \`${dest}\` — ${ge.result.stderr.trim()}`,
      { dest },
    );
  }
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
