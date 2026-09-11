/**
 * `crew install --from-git <value>` normalization (§5.3).
 *
 * The flag's value is always a git source. Anything `parseRef` already
 * classifies as git passes through untouched. A bare `owner/repo` (with
 * optional `@ref` and/or `//subpath`) would otherwise be read as a
 * `<tap>/<skill>` tap reference, so it is rewritten to the `@owner/repo`
 * GitHub shorthand. Everything else is `invalid_ref` naming the flag.
 *
 * The bare-head check runs BEFORE generic classification because a value
 * carrying a subpath (`acme/skills//tools/demo`) matches §8.5's "contains
 * `//` → git" rule first, and canonicalizing the bare `acme/skills` head
 * as a URL fails — so the value would never reach the tap branch.
 */

import { CrewError } from "../../core/errors.ts";
import { parseRef } from "../../refs/parse.ts";

/** `owner/repo` head, optionally followed by `@ref` and/or `//subpath`. */
const BARE_OWNER_REPO = /^[^/@\s]+\/[^/@\s]+(?:@[^/\s]+)?(?:\/\/.*)?$/;

/** Return the ref string the install flow should run with for `--from-git <raw>`. */
export function normalizeFromGit(raw: string, cwd: string): string {
  const value = raw.trim();
  const rewritten = asGithubShorthand(value);
  if (rewritten !== null && isGit(rewritten, cwd)) return rewritten;
  if (isGit(value, cwd)) return value;
  throw new CrewError(
    "invalid_ref",
    `\`--from-git ${raw}\` isn't a git source — pass a git URL, \`gh:owner/repo\`, \`@owner/repo\`, or \`owner/repo\``,
    { flag: "from-git", value: raw },
  );
}

/**
 * Rewrite a bare `owner/repo[...tail]` to `@owner/repo[...tail]`, or
 * `null` when the value isn't that shape. Values that already carry a
 * scheme, host shorthand, or leading `@` are left for `parseRef`.
 */
function asGithubShorthand(value: string): string | null {
  if (value.startsWith("@") || value.includes("://") || value.startsWith("git@")) return null;
  if (/^[a-z]{2}:/.test(value)) return null;
  return BARE_OWNER_REPO.test(value) ? `@${value}` : null;
}

function isGit(value: string, cwd: string): boolean {
  try {
    return parseRef(value, cwd).type === "git";
  } catch {
    return false;
  }
}
