/**
 * GitHub gist references (§8.2 "Gists").
 *
 * A gist is a git repository with no directories. Crew recognises one by
 * its host and rewrites the page URLs a browser shows to the gist's clone
 * URL, so every spelling of one gist records the same URL. Discovery of
 * the skill files inside a gist lives in `sources/gist.ts`.
 */

import { CrewError } from "../core/errors.ts";
import { displayUrl } from "./display-url.ts";

/** The only host whose repositories use the gist layout (§8.2). */
export const GIST_HOST = "gist.github.com";

/** Gist IDs are hex; the oldest gists have short, all-digit IDs. */
const GIST_ID = /^[0-9a-f]+$/i;

/** A revision page names a full commit SHA. */
const REVISION = /^[0-9a-f]{40}$/i;

/**
 * A clone URL on the gist host, in any form crew records: scheme URLs
 * (optionally with userinfo or a port) and scp-style `git@host:` remotes.
 * The host must be followed by `/` or `:`, so `gist.github.com.example`
 * is not mistaken for it.
 */
const GIST_URL = /^(?:[a-z][a-z0-9+.-]*:\/\/(?:[^@/]*@)?|[^@/:]+@)gist\.github\.com[:/]/i;

/** True when `url` addresses a GitHub gist. */
export function isGistUrl(url: string): boolean {
  return GIST_URL.test(url);
}

/** Clone URL plus the ref a gist page URL encoded. */
export interface GistUrlParts {
  readonly url: string;
  readonly ref: string | null;
}

/**
 * Rewrite a gist page URL (already stripped of query, fragment, and
 * trailing `/`) to its clone URL. `origin` is the scheme, any userinfo,
 * and the host; `segments` is the path split on `/`. Accepted:
 * `/<id>`, `/<owner>/<id>`, either with `.git`, and the revision page
 * `/<owner>/<id>/<sha>`. Anything else on the gist host is `invalid_ref`.
 */
export function gistCloneUrl(origin: string, segments: readonly string[]): GistUrlParts {
  const idAt = segments.length === 1 ? 0 : 1;
  const id = (segments[idAt] ?? "").replace(/\.git$/, "");
  const revision = segments[idAt + 1];
  const recognised =
    segments.length <= idAt + 2 &&
    GIST_ID.test(id) &&
    (revision === undefined || REVISION.test(revision));
  if (!recognised) {
    const shown = displayUrl(`${origin}/${segments.join("/")}`);
    throw new CrewError(
      "invalid_ref",
      `\`${shown}\` isn't a gist — use the gist's own page, \`https://${GIST_HOST}/<owner>/<id>\``,
      { ref: shown },
    );
  }
  return { url: `${origin}/${id}.git`, ref: revision ?? null };
}
