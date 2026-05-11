/**
 * Default tap-name derivation, shared by `crew tap add` (registered taps)
 * and the install flow's auto-tap creation.
 *
 * Root git tap: last URL segment (minus `.git`).
 * Subpath git tap: `<last-repo-segment>-<last-subpath-segment>` to
 *   reduce collisions when every monorepo's tap dir is `skills`.
 *
 * Result is lowercased + non-`[a-z0-9-]` chars replaced with `-`,
 * with leading non-alphanumerics and trailing hyphens trimmed. If the
 * sanitized name is empty, returns the raw value so the caller's
 * downstream validator can quote it in a useful error.
 */

export function deriveAutoTapName(url: string, subpath: string): string {
  const repoTail = lastSegment(url);
  const repoBase = repoTail.endsWith(".git") ? repoTail.slice(0, -4) : repoTail;
  const raw = !subpath || subpath.length === 0 ? repoBase : `${repoBase}-${lastSegment(subpath)}`;
  return sanitize(raw);
}

/** Last path component of a URL or path, ignoring empty segments. */
function lastSegment(s: string): string {
  let tail = s;
  const scheme = tail.indexOf("://");
  if (scheme >= 0) tail = tail.slice(scheme + 3);
  const parts = tail.split(/[/:]/).filter(Boolean);
  return parts[parts.length - 1] ?? "tap";
}

function sanitize(raw: string): string {
  const lowered = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-");
  const trimmed = lowered.replace(/^[^a-z0-9]+/, "").replace(/-+$/, "");
  return trimmed.length > 0 ? trimmed : raw;
}
