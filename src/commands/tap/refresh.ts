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
import { canonicalRepoUrl, tapClonePath } from "../../core/repo-path.ts";
import type { TapConfig } from "../../core/types.ts";
import { ensureRepo } from "../../git/repo.ts";
import { migrateTapClone } from "../../sources/migrate-clones.ts";

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

/**
 * Outcome for a tap whose repository was already fetched earlier in this
 * run: it inherits that fetch's result rather than repeating it.
 */
function repeatRow(tap: TapConfig, failure: CrewError | null): TapRefreshRow {
  if (failure === null) return { name: tap.name, url: tap.url, kind: "refreshed" };
  return {
    name: tap.name,
    url: tap.url,
    kind: "failed",
    error: { code: failure.code ?? "source_unreachable", message: failure.message },
  };
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

/**
 * Fetch + fast-forward each git tap; skip path taps; never throws
 * per-tap.
 *
 * Taps sharing a repository share a clone (§6), so a repo is fetched at
 * most once per run — the second tap on the same URL reports the first
 * fetch's outcome instead of hitting the network again.
 */
export function refreshTaps(taps: readonly TapConfig[], home: string): TapRefreshRow[] {
  const rows: TapRefreshRow[] = [];
  const fetched = new Map<string, CrewError | null>();
  for (const tap of taps) {
    if (tap.kind === "path") {
      rows.push(skippedPathRow(tap));
      continue;
    }
    migrateTapClone(tap, home);
    const repoKey = canonicalRepoUrl(tap.url);
    const previous = fetched.get(repoKey);
    if (previous !== undefined) {
      rows.push(repeatRow(tap, previous));
      continue;
    }
    try {
      ensureRepo(tap.url, tapClonePath(tap, home));
      fetched.set(repoKey, null);
      rows.push({ name: tap.name, url: tap.url, kind: "refreshed" });
    } catch (err) {
      fetched.set(repoKey, err as CrewError);
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
