/**
 * Ref resolution and classification (§9 step 3, §11.1).
 *
 * Turning a user-supplied `@<ref>` tail into a commit SHA, and deciding
 * whether that ref names an immutable revision. A SHA or tag pins; a
 * branch tracks, so `crew update` may advance it.
 *
 * Split from `repo.ts`, which owns clone/fetch, to keep both files
 * within the project's file-size cap.
 */

import { CrewError } from "../core/errors.ts";
import { runGit } from "./exec.ts";

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
  if (refExists(repoPath, `refs/tags/${ref}`)) return "tag";
  if (refExists(repoPath, `refs/heads/${ref}`)) return "branch";
  if (refExists(repoPath, `refs/remotes/origin/${ref}`)) return "branch";
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

/** True when `fullRef` resolves in `repoPath`. */
function refExists(repoPath: string, fullRef: string): boolean {
  const result = runGit(["rev-parse", "--verify", fullRef], {
    cwd: repoPath,
    throwOnError: false,
  });
  return result.exitCode === 0;
}
