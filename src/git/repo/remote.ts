/**
 * Asking a remote what a ref names right now, without cloning or fetching
 * (§9.3). This is a lookup only: it changes nothing locally or remotely.
 */

import { CrewError } from "../../core/errors.ts";
import { displayText, displayUrl } from "../../refs/display-url.ts";
import { GitProcessError, runGit } from "../exec.ts";

/**
 * The commit that the branch or tag `branchOrTag` names on the remote at
 * `url`: a tag if there is one by that name, otherwise a branch, the same
 * precedence local resolution uses. Null asks for the remote's default
 * branch.
 *
 * Only a branch or tag name can be looked up. A commit, full or
 * abbreviated, is not something a remote lists, so it returns null, the
 * same as a name the remote does not have: null means "no branch or tag by
 * that name", not "no such commit". An unreachable remote is
 * `source_unreachable`.
 */
export function remoteCommitOf(url: string, branchOrTag: string | null): string | null {
  // git reads these arguments as patterns. A ref name cannot contain a
  // pattern character (git-check-ref-format), so one that does names
  // nothing, and is not sent: `*` would ask for every ref the remote has.
  if (branchOrTag !== null && /[*?[\\]/.test(branchOrTag)) return null;
  const tag = `refs/tags/${branchOrTag}`;
  // An annotated tag is listed twice: the tag object, and `^{}` for the commit it points at.
  const peeledTag = `${tag}^{}`;
  const branch = `refs/heads/${branchOrTag}`;
  const wanted = branchOrTag === null ? ["HEAD"] : [peeledTag, tag, branch];
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
    stdout = runGit(["ls-remote", "--", url, ...names], { talksToRemote: true }).stdout;
  } catch (err) {
    // Anything else, such as git failing to start, is not about the remote.
    if (!(err instanceof GitProcessError)) throw err;
    const ge = err;
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
