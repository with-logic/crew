/**
 * GitHub release-feed client (§10.3).
 *
 * Fetches metadata about a published crew release. Returns only the
 * fields we care about so the rest of the module doesn't have to know
 * what shape the GitHub API returns. The network call itself is behind
 * a seam (`setReleaseFetcher`) so tests can stub the response without
 * touching real HTTP or the real GitHub API.
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

/** URL of the release feed for the "latest" release. */
export function releasesLatestUrl(): string {
  return (
    process.env["CREW_SELF_UPDATE_RELEASES_URL"] ??
    "https://api.github.com/repos/with-logic/crew/releases/latest"
  );
}

/** URL of the release feed for a specific tag. */
export function releasesByTagUrl(tag: string): string {
  const base =
    process.env["CREW_SELF_UPDATE_RELEASES_URL"] ??
    "https://api.github.com/repos/with-logic/crew/releases/latest";
  // Swap "/releases/latest" for "/releases/tags/<tag>" so the override
  // env var can redirect both forms with one setting.
  return base.replace(/\/releases\/latest\/?$/, `/releases/tags/${tag}`);
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
