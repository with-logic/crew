/**
 * Tap refresh: fetch upstream into each configured git-kind tap and
 * fast-forward its working tree. Path-kind taps have no upstream and
 * are silently skipped.
 *
 * Used by two commands:
 *   - `crew update` runs it at the top of the run (§10.1 step 1) so
 *     the per-skill update loop and tap re-expansion see latest
 *     upstream state.
 *   - `crew tap update [<name>]` runs it as the explicit "refresh
 *     taps, don't touch installed skills" operation.
 *
 * Per-tap failures are isolated into the returned `TapRefreshRow[]` so
 * callers can report them individually rather than aborting for one
 * offline tap.
 */

import type { CrewError } from "../../core/errors.ts";
import { tapPath } from "../../core/paths.ts";
import type { TapConfig } from "../../core/types.ts";
import { ensureRepo } from "../../git/repo.ts";
import { displayUrl } from "../../refs/display-url.ts";

export interface TapRefreshRow {
  readonly name: string;
  readonly url: string;
  readonly kind: "refreshed" | "skipped" | "failed";
  readonly reason?: string;
  readonly error?: { readonly code: string; readonly message: string };
}

/** Fetch + fast-forward each git tap; skip path taps; never throws per-tap. */
export function refreshTaps(taps: readonly TapConfig[], home: string): TapRefreshRow[] {
  const rows: TapRefreshRow[] = [];
  for (const tap of taps) {
    if (tap.kind === "path") {
      rows.push({
        name: tap.name,
        url: "",
        kind: "skipped",
        reason: "path tap (no upstream to fetch)",
      });
      continue;
    }
    try {
      ensureRepo(tap.url, tapPath(tap.name, home));
      // A tap URL may carry credentials (§16.3); rows reach both human and
      // JSON output, so redact once here rather than at each renderer.
      rows.push({ name: tap.name, url: displayUrl(tap.url), kind: "refreshed" });
    } catch (err) {
      const ce = err as CrewError;
      rows.push({
        name: tap.name,
        url: displayUrl(tap.url),
        kind: "failed",
        error: { code: ce.code ?? "source_unreachable", message: ce.message },
      });
    }
  }
  return rows;
}
