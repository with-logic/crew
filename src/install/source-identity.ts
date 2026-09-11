/**
 * Canonical source identity for installed skills (§5.4, §16.5).
 *
 * A skill's *source* is where its bytes come from: a repository (or a
 * local directory) plus a location inside it. Two installs of the same
 * skill are the same source when those two things match, regardless of
 * which tap row happens to point at them.
 *
 * This matters because one repository can back several taps. Installing
 * `@acme/skills//skills/docx` creates an auto tap with `subpath:
 * "skills/docx"` and an entry whose tap-relative path is `""`; later
 * installing `@acme/skills` creates a tap with no subpath and an entry
 * whose path is `skills/docx`. Both name the same directory in the same
 * repo, so §5.4's "the source differs" test must compare the joined
 * location, not the tap name plus path.
 *
 * URL comparison is deliberately loose about the spellings crew itself
 * produces: `gh:acme/skills` canonicalizes to
 * `https://github.com/acme/skills.git` while a hand-typed
 * `https://github.com/acme/skills` is recorded verbatim. Those are one
 * repository, so a trailing `.git`, a trailing slash, and host casing
 * are all normalized away before comparing.
 */

import type { StateSource, TapConfig } from "../core/types.ts";

/** A source location, canonicalized for comparison. */
export interface SourceIdentity {
  /** Canonical repo URL (git taps) or absolute directory (path taps). */
  readonly root: string;
  /** POSIX location inside that root. Empty when the root is the skill. */
  readonly location: string;
}

/** True when both identities name the same directory in the same root. */
export function sameSourceIdentity(a: SourceIdentity, b: SourceIdentity): boolean {
  return a.root === b.root && a.location === b.location;
}

/** Canonical identity of a skill at `tapRelativePath` inside `tap`. */
export function sourceIdentityOf(tap: TapConfig, tapRelativePath: string): SourceIdentity {
  if (tap.kind === "path") {
    return { root: trimTrailingSlashes(tap.path), location: joinPosix("", tapRelativePath) };
  }
  return {
    root: canonicalRepoUrl(tap.url),
    location: joinPosix(tap.subpath, tapRelativePath),
  };
}

/**
 * Canonical identity of an existing state entry, resolved through the
 * tap row it references. Returns null when the tap is no longer in
 * config — the caller can't compare locations it can't resolve.
 */
export function identityOfStateSource(
  source: StateSource,
  taps: readonly TapConfig[],
): SourceIdentity | null {
  const tap = taps.find((t) => t.name === source.tap);
  if (!tap) return null;
  return sourceIdentityOf(tap, source.path);
}

/**
 * Normalize a git URL so the spellings crew produces for one repository
 * compare equal: lowercase scheme and host, no trailing `.git`, no
 * trailing slash. Anything crew can't parse as a URL (`git@host:owner/repo`)
 * is lowercased and stripped the same way without host surgery.
 */
export function canonicalRepoUrl(url: string): string {
  const trimmed = trimTrailingSlashes(url.trim());
  const withoutGit = trimmed.endsWith(".git") ? trimmed.slice(0, -4) : trimmed;
  const stripped = trimTrailingSlashes(withoutGit);
  const schemeEnd = stripped.indexOf("://");
  if (schemeEnd < 0) return stripped;
  const scheme = stripped.slice(0, schemeEnd).toLowerCase();
  const rest = stripped.slice(schemeEnd + 3);
  const slash = rest.indexOf("/");
  const host = (slash < 0 ? rest : rest.slice(0, slash)).toLowerCase();
  const path = slash < 0 ? "" : rest.slice(slash);
  return `${scheme}://${host}${path}`;
}

/** Join two POSIX path fragments, skipping empty ones. */
function joinPosix(a: string, b: string): string {
  const parts = [a, b].map(trimSlashes).filter((p) => p.length > 0);
  return parts.join("/");
}

function trimSlashes(s: string): string {
  return s.replace(/^\/+/, "").replace(/\/+$/, "");
}

function trimTrailingSlashes(s: string): string {
  return s.replace(/\/+$/, "");
}
