/** Canonical repository URL identity, preserving credentials and path case (§5.4, §6). */

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

function trimTrailingSlashes(s: string): string {
  return s.replace(/\/+$/, "");
}
