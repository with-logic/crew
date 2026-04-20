/**
 * Post-command update-available notice (§10.4).
 *
 * Runs after every command, on the main thread:
 *   1. Should we emit anything at all? (suppression rules below)
 *   2. If the cached record is stale (> 24h), kick off a detached
 *      subprocess to refresh it. Never blocks.
 *   3. If the current cached `latest_tag` differs from `CREW_VERSION`,
 *      emit a one-line notice on stderr.
 *
 * The suppression rules (§10.4) prevent the notice from contaminating
 * scripts, CI pipelines, the launchd autoupdater, and JSON output.
 */

import type { OutputStreams } from "../cli/output.ts";
import { spawnBackgroundCheck } from "./background.ts";
import { isStale, noticeFor, readVersionCheck } from "./check.ts";

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
 * Maybe emit the notice and maybe spawn the background check.
 * Tolerant of every conceivable failure — this is ancillary behavior,
 * not something the user invoked.
 */
export function maybeEmitUpdateNotice(ctx: NoticeContext): void {
  if (isSuppressed(ctx)) return;

  const record = readVersionCheck(ctx.home);
  const now = ctx.now ?? new Date();

  if (isStale(now, record)) {
    spawnBackgroundCheck(ctx.home);
  }

  // Emit against the *current* record (not whatever the background
  // child might eventually write). First-run users see no nag; the
  // background child populates the file for the next invocation.
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
