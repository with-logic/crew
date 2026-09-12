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

/** Fields every refresh row carries, whatever its outcome. */
interface TapRefreshBase {
  readonly name: string;
  readonly url: string;
}

/**
 * One tap's refresh outcome. A discriminated union rather than optional
 * fields: only `skipped` has a `reason` and only `failed` has an
 * `error`, so a row can't claim both or neither.
 *
 * `pending` is the `--dry-run` outcome: would be fetched, wasn't.
 */
export type TapRefreshRow =
  | (TapRefreshBase & { readonly kind: "refreshed" })
  | (TapRefreshBase & { readonly kind: "pending" })
  | (TapRefreshBase & { readonly kind: "skipped"; readonly reason: string })
  | (TapRefreshBase & {
      readonly kind: "failed";
      readonly error: { readonly code: string; readonly message: string };
    });

function skippedPathRow(tap: TapConfig): TapRefreshRow {
  return { name: tap.name, url: "", kind: "skipped", reason: "path tap (no upstream to fetch)" };
}

/** The `--dry-run` twin of `refreshTaps`: same rows, no network (§16.3). */
export function planRefresh(taps: readonly TapConfig[]): TapRefreshRow[] {
  const rows: TapRefreshRow[] = [];
  for (const tap of taps) {
    if (tap.kind === "path") {
      rows.push(skippedPathRow(tap));
      continue;
    }
    rows.push({ name: tap.name, url: tap.url, kind: "pending" });
  }
  return rows;
}

/** Fetch + fast-forward each git tap; skip path taps; never throws per-tap. */
export function refreshTaps(taps: readonly TapConfig[], home: string): TapRefreshRow[] {
  const rows: TapRefreshRow[] = [];
  for (const tap of taps) {
    if (tap.kind === "path") {
      rows.push(skippedPathRow(tap));
      continue;
    }
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
