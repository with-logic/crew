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
 * the host. Non-http inputs are returned untouched.
 */

import { CrewError } from "../core/errors.ts";

/** Clone URL plus whatever ref / subpath the browser URL encoded. */
export interface BrowserUrlParts {
  readonly url: string;
  readonly ref: string | null;
  readonly subpath: string;
}

const PASSTHROUGH = (url: string): BrowserUrlParts => ({ url, ref: null, subpath: "" });

/** Normalize `raw` per §8.2. Throws `invalid_ref` for a `blob` link to a non-`SKILL.md` file. */
export function normalizeBrowserUrl(raw: string): BrowserUrlParts {
  if (!/^https?:\/\//i.test(raw)) return PASSTHROUGH(raw);
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    // Leave malformed URLs to the downstream validator's error path.
    return PASSTHROUGH(raw);
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const origin = `${u.protocol}//${host}${u.port ? `:${u.port}` : ""}`;
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

/** `/<o>/<r>/{tree,blob}/<ref>/<path…>`, `/commit/<sha>`, `/releases/tag/<tag>`. */
const GITHUB_SHAPES: Readonly<Record<string, Shape>> = { tree: "dir", blob: "file", commit: "ref" };
/** `/<group…>/<r>/-/{tree,blob}/<ref>/<path…>`, `/-/commit/<sha>`, `/-/tags/<tag>`. */
const GITLAB_SHAPES: Readonly<Record<string, Shape>> = {
  tree: "dir",
  blob: "file",
  commit: "ref",
  tags: "ref",
};
/**
 * `/<o>/<r>/src/<ref>/<path…>`, `/commits/<sha>`. Bitbucket uses `src/`
 * for both directories and files, so it gets the `file` treatment: a
 * trailing `SKILL.md` is stripped, anything else is taken as a directory.
 */
const BITBUCKET_SHAPES: Readonly<Record<string, Shape>> = { src: "file", commits: "ref" };

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
  shapes: Readonly<Record<string, Shape>>,
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
  if (shape === "file" && kind === "blob" && leaf !== "SKILL.md") {
    throw new CrewError(
      "invalid_ref",
      `\`${raw}\` points at a file — a reference must be a directory that contains SKILL.md (or a link to the SKILL.md itself)`,
      { ref: raw },
    );
  }
  const dir = leaf === "SKILL.md" ? path.slice(0, -1) : path;
  return { url, ref, subpath: dir.join("/") };
}
