/**
 * Higher-level git operations crew uses: clone, fetch, resolve refs to
 * SHAs, classify a ref as tag/branch/sha, and list files at a given ref.
 *
 * Every external operation translates `GitProcessError` into crew's
 * `source_unreachable` / `ref_not_found` errors with appropriate exit
 * codes, so callers just catch `CrewError` and report.
 */

import { CrewError } from "../core/errors.ts";
import { exists, isDirectory } from "../util/fs.ts";
import { type GitProcessError, runGit } from "./exec.ts";

/** Clone a repo into `dest`. Shallow unless `full` is true. */
export function cloneRepo(url: string, dest: string, full: boolean = false): void {
  try {
    const args = full ? ["clone", url, dest] : ["clone", "--no-single-branch", url, dest];
    runGit(args);
  } catch (err) {
    // `runGit` only ever throws `GitProcessError`, so this narrow is
    // safe. Translate to the user-facing error category.
    const ge = err as GitProcessError;
    throw new CrewError("source_unreachable", `failed to clone ${url}: ${ge.result.stderr.trim()}`);
  }
}

/**
 * Ensure a clone of `url` exists at `dest`; if it does, fetch. Returns
 * true if the clone was newly created, false if it was fetched.
 */
export function ensureRepo(url: string, dest: string): boolean {
  if (!exists(dest)) {
    cloneRepo(url, dest);
    return true;
  }
  if (!isDirectory(`${dest}/.git`)) {
    // Something exists but isn't a git checkout.
    throw new CrewError("source_unreachable", `existing path ${dest} is not a git repository`);
  }
  try {
    runGit(["fetch", "--tags", "--prune", "origin"], { cwd: dest });
  } catch (err) {
    const ge = err as GitProcessError;
    throw new CrewError(
      "source_unreachable",
      `git fetch failed in ${dest}: ${ge.result.stderr.trim()}`,
    );
  }
  return false;
}

/**
 * Resolve a ref (tag, branch, SHA, or null for default branch) to a full
 * 40-character SHA within `repoPath`. For a null ref, we prefer the
 * remote-tracking ref (`origin/HEAD`) over local `HEAD` so that after a
 * `git fetch`, we see the latest upstream commit.
 */
export function resolveRef(repoPath: string, ref: string | null): string {
  const target = ref ?? "HEAD";
  const candidates =
    ref === null
      ? ["refs/remotes/origin/HEAD", "origin/HEAD", "HEAD"]
      : [`refs/tags/${ref}`, `refs/remotes/origin/${ref}`, `refs/heads/${ref}`, ref];
  for (const cand of candidates) {
    const result = runGit(["rev-parse", "--verify", `${cand}^{commit}`], {
      cwd: repoPath,
      throwOnError: false,
    });
    if (result.exitCode === 0) {
      const sha = result.stdout.trim();
      if (/^[0-9a-f]{40}$/.test(sha)) return sha;
    }
  }
  throw new CrewError("ref_not_found", `ref not found: ${target}`);
}

/** Classify a ref in a repo as "sha", "tag", "branch", or "unknown". */
export function classifyRef(
  repoPath: string,
  ref: string | null,
): "sha" | "tag" | "branch" | "unknown" {
  if (ref === null) return "branch";
  // A 40-char hex is an exact SHA.
  if (/^[0-9a-f]{40}$/i.test(ref)) return "sha";
  // Tag?
  const tagResult = runGit(["rev-parse", "--verify", `refs/tags/${ref}`], {
    cwd: repoPath,
    throwOnError: false,
  });
  if (tagResult.exitCode === 0) return "tag";
  // Branch?
  const branchResult = runGit(["rev-parse", "--verify", `refs/heads/${ref}`], {
    cwd: repoPath,
    throwOnError: false,
  });
  if (branchResult.exitCode === 0) return "branch";
  const originBranchResult = runGit(["rev-parse", "--verify", `refs/remotes/origin/${ref}`], {
    cwd: repoPath,
    throwOnError: false,
  });
  if (originBranchResult.exitCode === 0) return "branch";
  // Maybe an abbreviated SHA.
  const shaResult = runGit(["rev-parse", "--verify", `${ref}^{commit}`], {
    cwd: repoPath,
    throwOnError: false,
  });
  if (shaResult.exitCode === 0) {
    const full = shaResult.stdout.trim();
    if (/^[0-9a-f]{40}$/.test(full)) return "sha";
  }
  return "unknown";
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
    throw new CrewError("ref_not_found", `could not check out ${sha}: ${ge.result.stderr.trim()}`);
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
