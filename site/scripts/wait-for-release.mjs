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

const POLL_SECONDS = 15;
const DEFAULT_WAIT_SECONDS = 20 * 60;

/** Whether `url` answers a HEAD request with success, following redirects. */
async function isDownloadable(url) {
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "follow" });
    return response.ok;
  } catch {
    return false;
  }
}

/** The URLs in `urls` that cannot be downloaded right now. */
async function missingFrom(urls) {
  const answers = await Promise.all(urls.map((url) => isDownloadable(url)));
  return urls.filter((_, index) => !answers[index]);
}

async function main() {
  if (process.env.VERCEL_ENV !== "production") return;
  const release = JSON.parse(readFileSync("public/latest-version.json", "utf8"));
  const urls = release.assets.map((asset) => asset.browser_download_url);
  const waitSeconds = Number(process.env.RELEASE_WAIT_SECONDS ?? DEFAULT_WAIT_SECONDS);
  const deadline = Date.now() + waitSeconds * 1000;

  let missing = await missingFrom(urls);
  while (missing.length > 0 && Date.now() < deadline) {
    process.stdout.write(
      `Waiting for ${release.tag_name}: ${missing.length} file(s) not published yet.\n`,
    );
    await new Promise((resolve) => setTimeout(resolve, POLL_SECONDS * 1000));
    missing = await missingFrom(missing);
  }
  if (missing.length > 0) {
    process.stderr.write(
      `${release.tag_name} is not fully published after ${waitSeconds}s. Missing:\n${missing.join("\n")}\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`${release.tag_name}: all ${urls.length} files are published.\n`);
}

await main();
