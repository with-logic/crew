/**
 * `crew install --from-git <value>` normalization (§5.3).
 *
 * The flag's value is always a git source. Anything `parseRef` already
 * classifies as git passes through untouched. A bare `owner/repo` (with
 * optional `@ref`) would otherwise be read as a `<tap>/<skill>` tap
 * reference, so it is rewritten to the `@owner/repo` GitHub shorthand.
 * Everything else is `invalid_ref` naming the flag.
 */

import { CrewError } from "../../core/errors.ts";
import { parseRef } from "../../refs/parse.ts";

/** Return the ref string the install flow should run with for `--from-git <raw>`. */
export function normalizeFromGit(raw: string, cwd: string): string {
  const value = raw.trim();
  if (classify(value, cwd) === "git") return value;
  const asGithub = `@${value}`;
  if (classify(value, cwd) === "tap" && classify(asGithub, cwd) === "git") return asGithub;
  throw new CrewError(
    "invalid_ref",
    `\`--from-git ${raw}\` isn't a git source — pass a git URL, \`gh:owner/repo\`, \`@owner/repo\`, or \`owner/repo\``,
    { flag: "from-git", value: raw },
  );
}

function classify(value: string, cwd: string): "git" | "tap" | "path" | null {
  try {
    return parseRef(value, cwd).type;
  } catch {
    return null;
  }
}
