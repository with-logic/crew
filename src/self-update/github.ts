/**
 * Release-feed client (§10.3).
 *
 * Fetches metadata about a published crew release. Returns only the
 * fields we care about so the rest of the module doesn't have to know
 * what the feed looks like on the wire. The network call itself is
 * behind a seam (`setReleaseFetcher`) so tests can stub the response
 * without touching real HTTP.
 *
 * Two endpoints, one for each use case:
 *
 *   - "Latest" — served by `https://crew.logic.inc/latest-version.json`,
 *     a static file on Vercel's edge cache. Fast (tens of ms), no rate
 *     limits, updated by `scripts/release.sh` on every release.
 *   - "Specific tag" — served by the GitHub API's
 *     `/repos/.../releases/tags/<tag>` endpoint. Slower and rate-limited,
 *     but the only way to pin a historical release.
 *
 * Both endpoints emit the same JSON shape: `{ tag_name, assets: [{ name,
 * browser_download_url }] }`. That's GitHub's native format; the site's
 * static file mimics it so we don't branch on response shape.
 *
 * We shell out to `curl` because crew's command path is synchronous
 * throughout — the installer script already requires `curl`, so this
 * adds no new host dependency.
 */

import { CrewError } from "../core/errors.ts";

/** A single published release. */
export interface ReleaseInfo {
  /** The version tag, e.g. "v0.4.0". */
  readonly tag: string;
  /** Assets keyed by name (e.g. "crew-macos-arm64" → download URL). */
  readonly assets: Readonly<Record<string, string>>;
}

/**
 * URL for the "latest release" feed. Fast-path, edge-cached.
 * Overridable for tests + private forks via `CREW_SELF_UPDATE_RELEASES_URL`.
 */
export function releasesLatestUrl(): string {
  return (
    process.env["CREW_SELF_UPDATE_RELEASES_URL"] ?? "https://crew.logic.inc/latest-version.json"
  );
}

/**
 * URL for a specific tag. Always hits the GitHub API — the site's
 * fast-path file only carries the latest release.
 * Overridable for tests via `CREW_SELF_UPDATE_TAG_URL_BASE`.
 */
export function releasesByTagUrl(tag: string): string {
  const base =
    process.env["CREW_SELF_UPDATE_TAG_URL_BASE"] ??
    "https://api.github.com/repos/with-logic/crew/releases/tags";
  return `${base}/${tag}`;
}

/**
 * Network seam. Tests install a stub via `setReleaseFetcher`; the
 * default shells out to `curl`. `timeoutSeconds` is honored via
 * `--max-time`.
 */
export type ReleaseFetcher = (url: string, timeoutSeconds: number) => ReleaseInfo;

let fetcher: ReleaseFetcher = defaultFetcher;

export function setReleaseFetcher(next: ReleaseFetcher): ReleaseFetcher {
  const prev = fetcher;
  fetcher = next;
  return prev;
}

export function resetReleaseFetcher(): void {
  fetcher = defaultFetcher;
}

/** Fetch release info from `url`, throwing `self_update_unavailable` on failure. */
export function fetchRelease(url: string, timeoutSeconds: number): ReleaseInfo {
  return fetcher(url, timeoutSeconds);
}

function defaultFetcher(url: string, timeoutSeconds: number): ReleaseInfo {
  const proc = Bun.spawnSync({
    cmd: [
      "curl",
      "-fsSL",
      "--max-time",
      String(timeoutSeconds),
      "-H",
      "Accept: application/vnd.github+json",
      "-H",
      "User-Agent: crew-self-update",
      url,
    ],
    stdout: "pipe",
    stderr: "pipe",
  });
  if ((proc.exitCode ?? -1) !== 0) {
    const stderr = new TextDecoder().decode(proc.stderr).trim();
    throw new CrewError(
      "self_update_unavailable",
      `couldn't reach the release feed at ${url}${stderr ? `: ${stderr}` : ""}`,
      { url, stderr },
    );
  }
  const bodyText = new TextDecoder().decode(proc.stdout);
  let body: { tag_name?: string; assets?: { name?: string; browser_download_url?: string }[] };
  try {
    body = JSON.parse(bodyText);
  } catch (err) {
    throw new CrewError(
      "self_update_unavailable",
      `release feed at ${url} returned unparseable JSON: ${(err as Error).message}`,
      { url },
    );
  }
  const tag = body.tag_name;
  if (!tag) {
    throw new CrewError(
      "self_update_unavailable",
      `release feed at ${url} didn't include a tag_name field`,
      { url },
    );
  }
  const assets: Record<string, string> = {};
  for (const a of body.assets ?? []) {
    if (a.name && a.browser_download_url) assets[a.name] = a.browser_download_url;
  }
  return { tag, assets };
}
