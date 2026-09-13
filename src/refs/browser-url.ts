/**
 * Browser-URL normalization for git references (§8.2 "Browser URLs").
 *
 * A URL copied out of GitHub, GitLab, or Bitbucket's web UI
 * (`.../tree/<ref>/<path>`, `.../blob/<ref>/<path>/SKILL.md`, …) is
 * not a clone URL. `normalizeBrowserUrl` recognises those shapes and
 * splits them into the clone URL, the ref, and the subpath so the rest
 * of the parser sees the same thing it would for `gh:o/r@ref//path`.
 *
 * Any other `http(s)` URL still gets the cheap hygiene pass: `?query`,
 * `#fragment`, and trailing `/` dropped, leading `www.` removed from
 * the host. Userinfo (`user:token@`) is preserved — an authenticated
 * HTTPS URL must still clone — and only ever rendered through
 * `displayUrl`. Non-http inputs are returned untouched.
 */

import { CrewError } from "../core/errors.ts";
import { displayUrl } from "./display-url.ts";

/** Clone URL plus whatever ref / subpath the browser URL encoded. */
export interface BrowserUrlParts {
  readonly url: string;
  readonly ref: string | null;
  readonly subpath: string;
}

const PASSTHROUGH = (url: string): BrowserUrlParts => ({ url, ref: null, subpath: "" });

/**
 * Strip `?query` and `#fragment` from an `http(s)` URL before any grammar
 * tail is parsed (§8.2). Without this, `?x=@v9` or `#//evil` would be read
 * as an explicit `@ref` / `//subpath` tail — see C-REF-26. Returns the input
 * unchanged when it is not an `http(s)` URL crew can parse.
 */
export function stripUrlQueryAndFragment(raw: string): string {
  if (!isHttpUrl(raw)) return raw;
  const cut = Math.min(indexOrEnd(raw, "?"), indexOrEnd(raw, "#"));
  return raw.slice(0, cut);
}

function indexOrEnd(value: string, needle: string): number {
  const idx = value.indexOf(needle);
  return idx < 0 ? value.length : idx;
}

/** True if `raw` is an `http(s)` URL. */
function isHttpUrl(raw: string): boolean {
  return /^https?:\/\//i.test(raw);
}

/**
 * Normalize `raw` per §8.2. Throws `invalid_ref` for a `blob` link to a
 * non-`SKILL.md` file, or for an `http(s)` URL too malformed to parse.
 */
export function normalizeBrowserUrl(raw: string): BrowserUrlParts {
  if (!isHttpUrl(raw)) return PASSTHROUGH(raw);
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    // §13: every user-visible failure is a CrewError with a stable name.
    // Left alone, `canonicalizeUrl`'s own `new URL` throws a raw TypeError
    // that the CLI reports as `usage_error` (C-REF-17 requires invalid_ref).
    throw new CrewError(
      "invalid_ref",
      `\`${displayUrl(raw)}\` isn't a valid URL`,
      { ref: displayUrl(raw) },
      "Check the URL for typos. Git URLs look like `https://github.com/owner/repo`.",
    );
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  // Userinfo is kept: `https://user:token@host/o/r` must still clone. It is
  // never printed directly — every message renders through `displayUrl`.
  const credentials = u.username ? `${u.username}${u.password ? `:${u.password}` : ""}@` : "";
  const origin = `${u.protocol}//${credentials}${host}${u.port ? `:${u.port}` : ""}`;
  const segments = u.pathname.split("/").filter(Boolean);

  // The hygiene-only form: query, fragment, trailing slash, and `www.` gone.
  const plain = `${origin}/${segments.join("/")}`;

  const dash = segments.indexOf("-");
  const forge = { raw, plain, origin, segments };
  if (dash > 0) return fromForge(forge, dash, GITLAB_SHAPES);
  if (host === "github.com") return fromForge(forge, 2, GITHUB_SHAPES);
  if (host === "bitbucket.org") return fromForge(forge, 2, BITBUCKET_SHAPES);
  return PASSTHROUGH(plain);
}

/** How a forge's path keyword maps onto what follows it. */
type Shape = "dir" | "file" | "ref";

/**
 * The forge maps are sparse — an arbitrary keyword resolves to `undefined`,
 * and `noUncheckedIndexedAccess` keeps that in the type so callers must
 * handle the miss.
 */
type ShapeMap = Readonly<Record<string, Shape | undefined>>;

/** `/<o>/<r>/{tree,blob}/<ref>/<path…>`, `/commit/<sha>`, `/releases/tag/<tag>`. */
const GITHUB_SHAPES: ShapeMap = { tree: "dir", blob: "file", commit: "ref" };
/** `/<group…>/<r>/-/{tree,blob}/<ref>/<path…>`, `/-/commit/<sha>`, `/-/tags/<tag>`. */
const GITLAB_SHAPES: ShapeMap = {
  tree: "dir",
  blob: "file",
  commit: "ref",
  tags: "ref",
};
/**
 * `/<o>/<r>/src/<ref>/<path…>`, `/commits/<sha>`. Bitbucket serves both
 * directories and files under `src/`, with nothing in the URL to tell them
 * apart, so a trailing `SKILL.md` is stripped and any other leaf is taken
 * as a directory (§8.2; contrast the `blob` rule, where the forge does
 * distinguish). `dir` records that ambiguity explicitly.
 */
const BITBUCKET_SHAPES: ShapeMap = { src: "dir", commits: "ref" };

/**
 * `segments[0..repoEnd)` is the repo path; `segments[repoEnd]` is the
 * keyword (or, for GitLab, the `-` separator sits at `repoEnd` and the
 * keyword follows). Unknown keywords fall through as the plain URL — we
 * don't understand the page, so we leave the user's URL alone and let
 * git report what it thinks.
 */
interface ForgeUrl {
  readonly raw: string;
  readonly plain: string;
  readonly origin: string;
  readonly segments: readonly string[];
}

function fromForge(
  { raw, plain, origin, segments }: ForgeUrl,
  repoEnd: number,
  shapes: ShapeMap,
): BrowserUrlParts {
  const repo = segments.slice(0, repoEnd);
  const afterRepo =
    segments[repoEnd] === "-" ? segments.slice(repoEnd + 1) : segments.slice(repoEnd);
  const [kind, ref, ...path] = afterRepo;
  if (repo.length < 2 || !kind) return PASSTHROUGH(plain);
  const url = `${origin}/${repo.join("/")}.git`;
  if (kind === "releases" && ref === "tag" && path[0]) return { url, ref: path[0], subpath: "" };
  const shape = shapes[kind];
  if (!(shape && ref)) return PASSTHROUGH(plain);
  if (shape === "ref") return { url, ref, subpath: "" };
  const leaf = path[path.length - 1];
  if (shape === "file") rejectNonSkillFile(raw, path.length, leaf);
  const dir = leaf === "SKILL.md" ? path.slice(0, -1) : path;
  return { url, ref, subpath: dir.join("/") };
}

/**
 * A `blob` link names a file, so it must be the `SKILL.md` itself; the skill
 * directory is what crew installs. A `blob` link with no path at all names
 * nothing, which gets its own message rather than claiming a file.
 */
function rejectNonSkillFile(raw: string, pathLength: number, leaf: string | undefined): void {
  const safe = displayUrl(raw);
  if (pathLength === 0) {
    throw new CrewError(
      "invalid_ref",
      `\`${safe}\` names a branch but no file or folder — point at the skill's folder, or its SKILL.md`,
      { ref: safe },
    );
  }
  if (leaf !== "SKILL.md") {
    throw new CrewError(
      "invalid_ref",
      `\`${safe}\` points at a file — a reference must be a directory that contains SKILL.md (or a link to the SKILL.md itself)`,
      { ref: safe },
    );
  }
}
