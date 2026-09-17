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

/**
 * Canonical identity of a skill at `tapRelativePath` inside `tap`.
 *
 * Both kinds resolve to "one root, plus a location beneath it", so two
 * tap rows aimed at the same directory from different depths compare
 * equal. For a git tap the root is the repository and the tap's subpath
 * is folded into the location. A path tap has no equivalent outer
 * identity — the directory *is* the address — so the whole absolute
 * path becomes the location under a constant root. Keeping the
 * directory in `root` instead would make `/src/skills/docx` + `""` and
 * `/src` + `skills/docx` two different sources, which is exactly the
 * case §5.4 says is one.
 */
export function sourceIdentityOf(tap: TapConfig, tapRelativePath: string): SourceIdentity {
  if (tap.kind === "path") {
    // `joinPosix` trims leading slashes, which would erase the
    // distinction between an absolute and a relative directory, so the
    // leading separator is restored here.
    const joined = joinPosix(tap.path, tapRelativePath);
    const absolute = tap.path.startsWith("/");
    return { root: PATH_TAP_ROOT, location: absolute ? `/${joined}` : joined };
  }
  return {
    root: canonicalRepoUrl(tap.url),
    location: joinPosix(tap.subpath, tapRelativePath),
  };
}

/**
 * Root shared by every path-tap identity. Path taps are addressed by
 * absolute directory, so the discriminator lives in `location`; this
 * only has to be a value no canonical repo URL can collide with.
 */
const PATH_TAP_ROOT = "<local-path>";

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
 * trailing slash.
 *
 * Case is folded on the HOST only. Userinfo and the path are left as
 * typed, because both can be case-significant on the server: `Alice` and
 * `alice` may be different accounts, and `Acme/Skills` a different
 * repository from `acme/skills`. Folding them would make two distinct
 * sources compare equal, which §5.4 reads as "same source" — so a second
 * install would silently overwrite the first instead of raising
 * `name_conflict`.
 *
 * Anything crew can't parse as a URL (`git@host:owner/repo`) goes
 * through the same rule via `canonicalScpUrl`.
 */
export function canonicalRepoUrl(url: string): string {
  const trimmed = trimTrailingSlashes(url.trim());
  const withoutGit = trimmed.endsWith(".git") ? trimmed.slice(0, -4) : trimmed;
  const stripped = trimTrailingSlashes(withoutGit);
  const schemeEnd = stripped.indexOf("://");
  if (schemeEnd < 0) return canonicalScpUrl(stripped);
  const scheme = stripped.slice(0, schemeEnd).toLowerCase();
  const rest = stripped.slice(schemeEnd + 3);
  const slash = rest.indexOf("/");
  const authority = slash < 0 ? rest : rest.slice(0, slash);
  const path = slash < 0 ? "" : rest.slice(slash);
  return `${scheme}://${lowercaseHostOnly(authority)}${path}`;
}

/**
 * Lowercase the host portion of an authority, preserving any `user:pass@`
 * prefix exactly as typed.
 */
function lowercaseHostOnly(authority: string): string {
  const at = authority.lastIndexOf("@");
  if (at < 0) return authority.toLowerCase();
  const userinfo = authority.slice(0, at + 1);
  const host = authority.slice(at + 1);
  return `${userinfo}${host.toLowerCase()}`;
}

/**
 * Lowercase the host of an SCP-style remote (`git@GitHub.com:acme/repo`).
 * Only the segment before the `:` is touched — the path after it is
 * case-sensitive on the server, and the user part is left as typed.
 * Anything without that shape is returned unchanged.
 */
function canonicalScpUrl(url: string): string {
  const colon = url.indexOf(":");
  if (colon < 0) return url;
  const authority = url.slice(0, colon);
  const path = url.slice(colon);
  const at = authority.lastIndexOf("@");
  if (authority.slice(at + 1).length === 0) return url;
  return `${lowercaseHostOnly(authority)}${path}`;
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
