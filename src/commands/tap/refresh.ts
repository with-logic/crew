/**
 * Tap refresh: fetch upstream into each configured tap clone and
 * fast-forward its working tree.
 *
 * Used by two commands today:
 *   - `crew update` runs it at the top of the run (§10.1 step 1) so
 *     that the per-skill update loop and bundle re-expansion see the
 *     latest upstream state.
 *   - `crew tap update [<name>]` runs it as an explicit "refresh taps
 *     only, don't touch installed skills" operation.
 *
 * Per-tap failures are isolated into the returned `TapRefreshRow[]` so
 * callers can report them individually rather than aborting the whole
 * run for one offline tap.
 */

import type { CrewError } from "../../core/errors.ts";
import { tapPath } from "../../core/paths.ts";
import type { TapConfig } from "../../core/types.ts";
import { ensureRepo } from "../../git/repo.ts";

export interface TapRefreshRow {
  readonly name: string;
  readonly url: string;
  readonly kind: "refreshed" | "failed";
  readonly error?: { readonly code: string; readonly message: string };
}

/** Fetch + fast-forward each tap; never throws per-tap. */
export function refreshTaps(taps: readonly TapConfig[], home: string): TapRefreshRow[] {
  const rows: TapRefreshRow[] = [];
  for (const tap of taps) {
    try {
      ensureRepo(tap.url, tapPath(tap.name, home));
      rows.push({ name: tap.name, url: tap.url, kind: "refreshed" });
    } catch (err) {
      const ce = err as CrewError;
      rows.push({
        name: tap.name,
        url: tap.url,
        kind: "failed",
        error: { code: ce.code ?? "source_unreachable", message: ce.message },
      });
    }
  }
  return rows;
}
