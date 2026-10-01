/**
 * Ref operations on an existing clone: resolve a ref (tag, branch, SHA,
 * or the default branch) to a full SHA, classify a ref, check out a SHA,
 * and initialize a fixture repo. Obtaining the clone in the first place
 * is `./index.ts`.
 *
 * `GitProcessError` is translated into crew's `ref_not_found` /
 * `source_unreachable` errors here, as in `./index.ts`. Git's stderr is
 * quoted into those messages and can repeat a credential-bearing
 * remote, so it passes through `redactText` first (§5.2).
 */

import { CrewError } from "../../core/errors.ts";
import { redactText } from "../../util/redact.ts";
import { type GitProcessError, runGit } from "../exec.ts";

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
  throw new CrewError(
    "ref_not_found",
    `no tag, branch, or commit named \`${target}\` in this repo`,
    { ref: target },
  );
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
    throw new CrewError(
      "ref_not_found",
      `couldn't check out ${sha.slice(0, 8)} — ${redactText(ge.result.stderr.trim())}`,
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
