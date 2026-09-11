/**
 * Git subpath validation (§8.4).
 *
 * The reference grammar defines `subpath` as "any POSIX relative path
 * not starting with `/`", but nothing enforced it: a value like
 * `gh:acme/skills//../../../etc` was carried through parsing and joined
 * against the tap's clone directory, normalizing to a location outside
 * the clone entirely. Every git-shaped reference funnels through
 * `parseGit`, so validating here covers every entry point — positional
 * installs, `--from-git`, `crew tap add`, `crew info`, and dependency
 * references alike.
 *
 * A valid subpath stays inside the repository: no absolute paths, no
 * `..` components, no backslashes (a Windows separator that POSIX
 * treats as an ordinary filename character, so allowing it would let
 * one spelling mean two different things).
 */

import { CrewError } from "../core/errors.ts";

/**
 * Normalize and validate a git subpath, returning the cleaned value.
 *
 * Collapses duplicate separators and drops `.` components so the stored
 * subpath is canonical. Throws `invalid_ref` naming the offending value
 * when it would escape the repository root.
 */
export function normalizeSubpath(subpath: string, ref: string): string {
  if (subpath.length === 0) return "";
  if (subpath.includes("\\")) {
    throw subpathError(subpath, ref, "backslashes aren't allowed — use `/` to separate segments");
  }
  if (subpath.startsWith("/")) {
    throw subpathError(subpath, ref, "subpaths are relative to the repository root");
  }
  const segments: string[] = [];
  for (const segment of subpath.split("/")) {
    // Duplicate separators produce empty segments; `.` is a no-op.
    if (segment.length === 0 || segment === ".") continue;
    if (segment === "..") {
      throw subpathError(subpath, ref, "`..` would point outside the repository");
    }
    segments.push(segment);
  }
  return segments.join("/");
}

function subpathError(subpath: string, ref: string, reason: string): CrewError {
  return new CrewError(
    "invalid_ref",
    `\`${ref}\` has an invalid subpath \`${subpath}\` — ${reason}`,
    { ref, subpath },
  );
}
