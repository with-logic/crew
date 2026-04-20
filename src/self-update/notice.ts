/**
 * Post-command update-available notice (§10.4).
 *
 * Runs after every command, on the main thread:
 *   1. Should we emit anything at all? (suppression rules below)
 *   2. If the cached record is stale (> 24h), fetch the latest tag
 *      inline with a tight 2s timeout. On failure, leave the stale
 *      record in place so the next run retries in 24h — not on every
 *      invocation.
 *   3. If the resulting `latest_tag` differs from `CREW_VERSION`, emit
 *      a single stderr line.
 *
 * The fetch targets `https://crew.logic.inc/latest-version.json` by
 * default — a static file on Vercel's edge cache, much faster than
 * hitting the GitHub API. The release script updates it on publish.
 */

import type { OutputStreams } from "../cli/output.ts";
import { isStale, noticeFor, readVersionCheck, writeVersionCheck } from "./check.ts";
import { fetchRelease, releasesLatestUrl } from "./github.ts";

/** Tight timeout for the background check — we block the main thread. */
const VERSION_CHECK_TIMEOUT_SECONDS = 2;

/** Everything `maybeEmitUpdateNotice` needs to decide + act. */
export interface NoticeContext {
  readonly command: string;
  readonly home: string;
  readonly json: boolean;
  readonly quiet: boolean;
  readonly streams: OutputStreams;
  /** Whether stderr is a TTY (we suppress when it isn't). */
  readonly stderrIsTty: boolean;
  /** Override for tests; defaults to new Date(). */
  readonly now?: Date;
}

/**
 * Maybe refresh the version-check record and maybe emit the notice.
 * Tolerant of every conceivable failure — this is ancillary behavior,
 * not something the user invoked.
 */
export function maybeEmitUpdateNotice(ctx: NoticeContext): void {
  if (isSuppressed(ctx)) return;

  let record = readVersionCheck(ctx.home);
  const now = ctx.now ?? new Date();

  if (isStale(now, record)) {
    // Synchronous fetch with a short timeout. If GitHub is slow or
    // unreachable we swallow the error — the record just stays stale
    // for another 24h. We only block once per day.
    try {
      const release = fetchRelease(releasesLatestUrl(), VERSION_CHECK_TIMEOUT_SECONDS);
      writeVersionCheck(release.tag, ctx.home);
      record = { checked_at: new Date(now).toISOString(), latest_tag: release.tag };
    } catch {
      // Leave `record` (and the file) as-is. Next invocation retries
      // only once 24h have elapsed from the previous `checked_at`.
    }
  }

  const notice = noticeFor(record);
  if (notice) {
    ctx.streams.stderr(`${notice}\n`);
  }
}

function isSuppressed(ctx: NoticeContext): boolean {
  if (!ctx.stderrIsTty) return true;
  if (ctx.json) return true;
  if (ctx.quiet) return true;
  if (ctx.command === "self-update" || ctx.command === "version") return true;
  if (process.env["CREW_NO_UPDATE_CHECK"] === "1") return true;
  if (process.env["CREW_AUTOUPDATE_LOG"] === "1") return true;
  // Standard CI convention — set by GitHub Actions, GitLab, CircleCI,
  // Jenkins-via-convention, etc.
  if (process.env["CI"] !== undefined && process.env["CI"] !== "") return true;
  return false;
}
