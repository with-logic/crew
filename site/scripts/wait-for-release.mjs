/**
 * Runs before the site's production build. Waits until every file that
 * `public/latest-version.json` points at can be downloaded.
 *
 * Why: the release PR updates `latest-version.json`, and merging it starts
 * two things at once: this site's deploy, and the workflow that builds the
 * binaries and uploads them to the GitHub release. The deploy is faster.
 * Without this wait the site advertises the new version for a few minutes
 * before its binaries exist, and `crew self-update` fails in that window.
 *
 * Only a production deploy waits (`VERCEL_ENV=production`). A preview of the
 * release PR is built before the release exists, and a local or CI build
 * must not depend on the network.
 *
 * If the files never appear, the build fails and the previous deploy keeps
 * serving the previous version, which is the right answer when a release
 * did not publish.
 */

import { readFileSync } from "node:fs";

// A release takes about four minutes to build and upload. Checking every 15
// seconds adds at most that much to a deploy once the files are there.
const POLL_SECONDS = 15;
// Five times a normal release: long enough for a slow one, short enough that
// a release that never publishes fails the deploy well inside the host's limit.
const DEFAULT_WAIT_SECONDS = 20 * 60;
/** No single request may hold a check up for longer than this. */
const REQUEST_SECONDS = 10;

/** Why `url` cannot be downloaded right now (an HTTP status or a network error), or null if it can. */
async function whyUnavailable(url) {
  try {
    const signal = AbortSignal.timeout(REQUEST_SECONDS * 1000);
    const response = await fetch(url, { method: "HEAD", redirect: "follow", signal });
    return response.ok ? null : `HTTP ${response.status}`;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/** The URLs in `urls` that cannot be downloaded right now, each with the reason. */
async function unavailableAmong(urls) {
  const reasons = await Promise.all(urls.map((url) => whyUnavailable(url)));
  return urls
    .map((url, index) => ({ url, reason: reasons[index] }))
    .filter((probe) => probe.reason !== null);
}

/** The wait limit in seconds: `RELEASE_WAIT_SECONDS` when it is a positive number, else the default. */
function waitSeconds() {
  const given = Number(process.env.RELEASE_WAIT_SECONDS);
  return Number.isFinite(given) && given > 0 ? given : DEFAULT_WAIT_SECONDS;
}

async function main() {
  if (process.env.VERCEL_ENV !== "production") return;
  const release = JSON.parse(readFileSync("public/latest-version.json", "utf8"));
  const urls = release.assets.map((asset) => asset.browser_download_url);
  const limit = waitSeconds();
  const deadline = Date.now() + limit * 1000;

  let unavailable = await unavailableAmong(urls);
  while (unavailable.length > 0 && Date.now() < deadline) {
    process.stdout.write(
      `Waiting for ${release.tag_name}: ${unavailable.length} file(s) not available yet.\n`,
    );
    // Never sleep past the deadline.
    const pause = Math.min(POLL_SECONDS * 1000, deadline - Date.now());
    await new Promise((resolve) => setTimeout(resolve, pause));
    unavailable = await unavailableAmong(unavailable.map((probe) => probe.url));
  }
  if (unavailable.length > 0) {
    const lines = unavailable.map((probe) => `${probe.url} (${probe.reason})`);
    process.stderr.write(
      `${release.tag_name} is not fully available after ${limit}s:\n${lines.join("\n")}\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`${release.tag_name}: all ${urls.length} files are published.\n`);
}

await main();
