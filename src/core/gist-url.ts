/**
 * GitHub gist recognition (§8.2 "Gists").
 *
 * Whether a source is a gist is derived from its URL alone and never
 * stored (§9 step 5), so reference parsing, repository identity, and
 * discovery all ask the same questions here.
 */

/** The only host whose repositories use the gist layout (§8.2). */
export const GIST_HOST = "gist.github.com";

/** Gist IDs are hex — at most 32 characters; the oldest are short and all-digit. */
export const GIST_ID_PATTERN = /^[0-9a-f]+$/i;

/** The schemes a gist is served over. `file://` ignores its host, so it never names one. */
const GIST_SCHEMES: ReadonlySet<string> = new Set(["https:", "http:", "ssh:"]);

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
    const u = new URL(url);
    // A leading `www.` is dropped, as browser-URL normalization does (§8.2).
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return GIST_SCHEMES.has(u.protocol) && host === GIST_HOST;
  } catch {
    return false;
  }
}

/**
 * The identity of a gist URL's path: `/<id>`, lowercased, whichever owner
 * it named. GitHub serves a gist with or without its owner, so a tap
 * recorded as `/<owner>/<id>` and one recorded as `/<id>` are the same
 * repository (§5.4). Any other path is returned as written.
 */
export function gistIdentityPath(path: string): string {
  const segments = path.split("/").filter(Boolean);
  const id = segments[segments.length - 1] ?? "";
  if (segments.length > 2 || !GIST_ID_PATTERN.test(id)) return path;
  return `/${id.toLowerCase()}`;
}

/** A gist skill file's name: it ends in `.md`, in any case (§9 step 5, "Gists"). */
export function isSkillFileName(name: string): boolean {
  return /\.md$/i.test(name);
}
