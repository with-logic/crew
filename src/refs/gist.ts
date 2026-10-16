/**
 * GitHub gist references (§8.2 "Gists").
 *
 * A gist is a git repository with no directories. Crew rewrites the
 * page URLs a browser shows to the gist's clone URL, so every `https`
 * spelling of one gist records the same URL, and splits a `//<file>`
 * selection off so the tap is always the whole gist. Host recognition
 * lives in `core/gist-url.ts`; the layout of the files inside a gist in
 * `sources/gist.ts`.
 */

import { CrewError } from "../core/errors.ts";
import { GIST_ID_PATTERN, isGistUrl, isSkillFileName } from "../core/gist-url.ts";
import type { GitSource, PathSource } from "../core/types.ts";
import type { BrowserUrlParts } from "./browser-url.ts";
import { displayText, displayUrl } from "./display-url.ts";

/** A revision page names a full commit SHA, which no gist ID is long enough to be. */
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/i;

/** What a gist page names: the gist, and a revision when it is a revision page. */
interface GistPage {
  readonly id: string;
  readonly revision: string | null;
}

/** How to name a gist and its parts, for every rejected gist reference. */
const GIST_FORMS =
  "Use the gist's page, `https://gist.github.com/<owner>/<id>`. Add `//<file>.md` to install one of its skills, or `@<sha>` to pin a revision.";

/**
 * Rewrite a gist page URL (already stripped of query, fragment, and
 * trailing `/`) to its clone URL. `origin` is the scheme, any userinfo,
 * and the host; `segments` is the path split on `/`. Accepted:
 * `/<id>` and `/<owner>/<id>` (either with `.git`), each optionally
 * followed by a revision `/<sha>`. Anything else on the gist host is
 * `invalid_ref`.
 */
export function fromGistPage(origin: string, segments: readonly string[]): BrowserUrlParts {
  const page = gistPage(segments);
  if (page === null) {
    const shown = displayUrl(`${origin}/${segments.join("/")}`);
    throw new CrewError(
      "invalid_ref",
      `\`${shown}\` isn't a gist page crew can install from`,
      { ref: shown },
      GIST_FORMS,
    );
  }
  return { url: `${origin}/${page.id}.git`, ref: page.revision, subpath: "" };
}

/** Read a gist page's path segments; null for any other page on the gist host. */
function gistPage(segments: readonly string[]): GistPage | null {
  // With one segment, or a revision second, there is no owner segment.
  const ownerless = segments.length === 1 || FULL_SHA_PATTERN.test(segments[1] ?? "");
  const rest = ownerless ? segments : segments.slice(1);
  const id = (rest[0] ?? "").replace(/\.git$/, "").toLowerCase();
  const revision = rest[1]?.toLowerCase() ?? null;
  const isGist = rest.length <= 2 && GIST_ID_PATTERN.test(id);
  // No revision at all is fine; one that is present must be a full SHA.
  const revisionOk = revision === null || FULL_SHA_PATTERN.test(revision);
  return isGist && revisionOk ? { id, revision } : null;
}

/**
 * Reject a gist link to one file's anchor (`…#file-prd-md`). Dropping
 * the fragment, as every other URL's is, would silently install and
 * track the whole gist when the user pointed at one file — and the
 * anchor can't be mapped back to a file name, so it can't be honoured.
 */
export function assertNoGistFileAnchor(raw: string): void {
  const hash = raw.indexOf("#");
  const linksToOneFile = hash >= 0 && raw.slice(hash + 1).startsWith("file-");
  if (!(linksToOneFile && isGistUrl(raw))) return;
  const shown = displayUrl(raw);
  throw new CrewError(
    "invalid_ref",
    `\`${shown}\` links to one file of a gist — name the file after \`//\` instead (\`//<file>.md\`)`,
    { ref: shown },
    GIST_FORMS,
  );
}

/** A reference with any gist `//<file>` selection split off. */
export interface GistSelection {
  /**
   * The source the tap is found or created for: the whole gist, or —
   * for every non-gist source — the input itself, subpath included.
   */
  readonly tapSource: GitSource | PathSource;
  /** The selected gist skill file, or `""` when none was selected. */
  readonly gistFile: string;
}

/** True when `name` can be a gist `//<file>`: one top-level `.md` file name. */
export function isGistFileName(name: string): boolean {
  return !name.includes("/") && isSkillFileName(name);
}

/**
 * Split a gist reference's `//<file>` off (§8.2). A gist tap is always
 * the whole gist; the file instead narrows the install to one of its
 * skills, the way `<tap>/<skill>` does. The file must be one of the
 * names discovery could list — a top-level `.md` file — so a selection
 * never records a path the gist's index can't produce. Every other
 * source passes through untouched, keeping its subpath on the tap.
 */
export function splitGistFile(source: GitSource | PathSource): GistSelection {
  if (source.type === "path" || source.subpath === "" || !isGistUrl(source.url)) {
    return { tapSource: source, gistFile: "" };
  }
  const file = source.subpath;
  if (!isGistFileName(file)) {
    const shown = `${displayUrl(source.url)}//${displayText(file)}`;
    throw new CrewError(
      "invalid_ref",
      `\`${shown}\` doesn't name a gist file — a gist's skills are the \`.md\` files at its top level`,
      { ref: shown },
      GIST_FORMS,
    );
  }
  return { tapSource: { ...source, subpath: "" }, gistFile: file };
}
