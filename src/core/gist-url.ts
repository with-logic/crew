/**
 * GitHub gist recognition (§8.2 "Gists").
 *
 * Whether a source is a gist is derived from its URL alone and never
 * stored (§9 step 5), so reference parsing, repository identity, and
 * discovery all ask the same question here.
 */

/** The only host whose repositories use the gist layout (§8.2). */
export const GIST_HOST = "gist.github.com";

/**
 * True when `url` addresses a GitHub gist. A URL with a scheme is judged
 * by its parsed host, so userinfo that merely spells the gist host
 * (`https://gist.github.com:x@example.com/…`) doesn't pass; an scp-style
 * remote (`git@gist.github.com:<id>.git`) by the host before its `:`.
 */
export function isGistUrl(url: string): boolean {
  if (!url.includes("://")) {
    return /^[^@/:]+@([^@/:]+):/.exec(url)?.[1]?.toLowerCase() === GIST_HOST;
  }
  try {
    // A leading `www.` is dropped, as browser-URL normalization does (§8.2).
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "") === GIST_HOST;
  } catch {
    return false;
  }
}

/**
 * The identity of a gist's path: `/<id>`, whichever owner a URL named.
 * GitHub serves a gist with or without its owner, so a tap recorded as
 * `/<owner>/<id>` and one recorded as `/<id>` are the same repository
 * (§5.4). IDs are hex, so their case carries no meaning either.
 */
export function gistIdentityPath(path: string): string {
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0 || segments.length > 2) return path;
  return `/${segments[segments.length - 1]!.toLowerCase()}`;
}
