/**
 * GitHub gist recognition (§8.2 "Gists"), and the name rule for a gist's
 * skill files (§9 step 5).
 *
 * Whether a source is a gist is derived from its URL alone and never
 * stored, so reference parsing, repository identity, and discovery all
 * ask the same questions here. It is a leaf module so every layer can.
 */

import type { TapConfig } from "./types.ts";

/** The only host whose repositories use the gist layout (§8.2). */
const GIST_HOST = "gist.github.com";

/** Gist IDs are hex — at most 32 characters; the oldest are short and all-digit. */
export const GIST_ID_PATTERN = /^[0-9a-f]+$/i;

/** The schemes a gist is served over. `file://` ignores its host, so it never names one. */
const GIST_SCHEMES: ReadonlySet<string> = new Set(["https:", "http:", "ssh:"]);

/**
 * True when `tap` is backed by a GitHub gist and so uses the gist layout.
 * A path tap has no URL of its own, so it never is one.
 */
export function isGistTap(tap: Pick<TapConfig, "kind" | "url">): boolean {
  return tap.kind === "git" && isGistUrl(tap.url);
}

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
    return GIST_SCHEMES.has(u.protocol) && isGistHost(u.hostname);
  } catch {
    return false;
  }
}

/** True for the gist host, in any case, with or without a leading `www.` (§8.2). */
export function isGistHost(hostname: string): boolean {
  return hostname.toLowerCase().replace(/^www\./, "") === GIST_HOST;
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

/**
 * True when a file name or path ends in `.md`, in any case — the extension
 * a gist skill file has (§9 step 5, "Gists"). A `//<file>` selection must
 * also be top-level: see `isGistSkillFileName`.
 */
export function hasMarkdownExtension(name: string): boolean {
  return /\.md$/i.test(name);
}

/** True when `name` can be a gist `//<file>`: one top-level `.md` file name. */
export function isGistSkillFileName(name: string): boolean {
  return !name.includes("/") && hasMarkdownExtension(name);
}
