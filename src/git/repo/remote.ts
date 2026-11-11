/**
 * Asking a remote what a ref names right now, without cloning or fetching
 * (§9.3). Used to move a project's unpinned manifest lines to their latest
 * commit.
 */

import { CrewError } from "../../core/errors.ts";
import { displayText, displayUrl } from "../../refs/display-url.ts";
import { type GitProcessError, runGit } from "../exec.ts";

/**
 * The commit that `ref` names on the remote at `url`: a tag if there is one
 * by that name, otherwise a branch, the same precedence local resolution
 * uses. A null `ref` asks for the remote's default branch.
 *
 * Returns null when the remote has no branch or tag by that name, which is
 * what a ref that is an abbreviated commit looks like from here. An
 * unreachable remote is `source_unreachable`.
 */
export function remoteCommitOf(url: string, ref: string | null): string | null {
  const tag = `refs/tags/${ref}`;
  // An annotated tag is listed twice: the tag object, and `^{}` for the commit it points at.
  const peeledTag = `${tag}^{}`;
  const branch = `refs/heads/${ref}`;
  const wanted = ref === null ? ["HEAD"] : [peeledTag, tag, branch];
  const commits = listRemote(url, wanted);
  for (const name of wanted) {
    const sha = commits.get(name);
    if (sha !== undefined) return sha;
  }
  return null;
}

/** The remote's `sha` for each of `names` it lists. */
function listRemote(url: string, names: readonly string[]): Map<string, string> {
  let stdout: string;
  try {
    stdout = runGit(["ls-remote", "--", url, ...names]).stdout;
  } catch (err) {
    // `runGit` only ever throws `GitProcessError`.
    const ge = err as GitProcessError;
    throw new CrewError(
      "source_unreachable",
      `couldn't reach \`${displayUrl(url)}\` — ${displayText(ge.result.stderr.trim())}`,
      { url },
    );
  }
  // `names` are patterns to git, which may list more than was asked for;
  // only an exact name is taken.
  const commits = new Map<string, string>();
  for (const line of stdout.split("\n")) {
    const [sha, name] = line.split("\t");
    if (sha && name && names.includes(name)) commits.set(name, sha);
  }
  return commits;
}
