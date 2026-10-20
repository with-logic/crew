/**
 * Tap re-expansion for `crew update` (§10.1.1).
 *
 * For every git-kind tap with at least one state entry attributed to it
 * (filtered by `ReexpandSelection`), walk the tap one level deep and:
 *
 *   1. ADDITIONS — children present upstream but not in state: validate
 *      in full (§9 step 4) and install via the caller-provided
 *      `installNewChild` callback. A child that fails validation is
 *      reported as a `tap_error` and never installed.
 *   2. SOURCE_GONE — entries in state attributed to this tap whose
 *      directory is no longer present upstream: report; preserve local
 *      install.
 *
 * Existing-and-still-present children are handled by the regular
 * per-skill update loop in `update/entry.ts`.
 *
 * Path-kind taps follow the same algorithm; they just don't fetch and
 * their `resolvedSha` is null.
 *
 * With `dryRun` (§10.1.1) additions are reported as `would_add` and the
 * install callback is never invoked.
 */

import type { Config, StateEntry, StateFile } from "../../core/types.ts";
import { entryIdentity } from "../../state/collections/index.ts";
import { hasUsableProjectRoot } from "../../state/validation.ts";
import { isDirectory } from "../../util/fs.ts";
import { buildInstalledSourceIndex } from "../installed-lookup.ts";
import { reexpandGroup } from "./group.ts";
import { makeTapScanCache } from "./scan-cache.ts";
import type { InstallNewChild, TapReexpandResult, TapReexpandRow } from "./types.ts";

export type { InstallNewChild, TapReexpandResult, TapReexpandRow } from "./types.ts";

/**
 * Which groups a restricted run should re-expand. `memberIdentities`
 * holds entry identities (§11.1) rather than names, so a same-named
 * skill from another tap or scope can't pull its group in; `tapNames`
 * covers selectors that named a tap outright. `null` means no
 * positionals — every group.
 *
 * `namespaces` bounds which NEW children may be installed. A selector
 * naming one namespace pulls in its group, but the group spans the
 * whole tap, so without this bound a user who asked to update
 * `acme/alpha` would silently acquire a skill newly added to
 * `acme/beta` (§10.1.1). `null` means unbounded: a skill or tap selector
 * was supplied. Additions are bounded only for namespace-only runs.
 */
export interface ReexpandSelection {
  readonly memberIdentities: ReadonlySet<string>;
  readonly tapNames: ReadonlySet<string>;
  readonly namespaces: ReadonlySet<string> | null;
}

export function reexpandTaps(
  state: StateFile,
  config: Config,
  home: string,
  selection: ReexpandSelection | null,
  installOne: InstallNewChild,
  dryRun: boolean = false,
): TapReexpandResult {
  const added: StateEntry[] = [];
  const updated: StateEntry[] = [];
  const sourceGone = new Set<string>();
  const rows: TapReexpandRow[] = [];
  let hardFailure = false;
  // One tap backs several (scope, project_root) groups; acquire, walk
  // and validate it once per run rather than once per group.
  const cache = makeTapScanCache();
  const installedIndex = buildInstalledSourceIndex(state, config);

  // Group state entries by (tap-name, scope, project_root). Entries
  // sharing all three are managed together: same tap clone, same
  // install location, same target set (typically).
  const byKey = new Map<string, StateEntry[]>();
  for (const entry of state.installations) {
    const key = JSON.stringify([
      entry.source.tap,
      entry.scope,
      entry.project_root ?? "",
      entry.ref,
    ]);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(entry);
  }

  for (const members of byKey.values()) {
    const first = members[0]!;
    const tap = config.taps.find((t) => t.name === first.source.tap);
    if (!tap) {
      // Tap was removed from config but state still references it.
      // doctor --repair will rebuild it from markers; here we just skip.
      continue;
    }

    // Whole-tap tracking: only groups whose members asked for the
    // whole tap (either by URL or by tap name) get re-expanded. A
    // user who installed an individual skill from the tap doesn't
    // suddenly acquire every sibling on update.
    const tracksTap = members.some((m) => m.tracks_tap === true);
    if (!tracksTap) continue;

    // Restrict by selection — re-expand only if the user selected a
    // member of THIS group, or named the tap itself. Membership is
    // tested by full entry identity, not by name: a same-named skill
    // in another tap or at another scope is a different install and
    // must not drag this group into the run (§10.1).
    if (selection !== null) {
      const touchesMember = members.some((m) => selection.memberIdentities.has(entryIdentity(m)));
      const tapNamed = selection.tapNames.has(tap.name);
      if (!(touchesMember || tapNamed)) continue;
    }

    // Project-scoped group whose project_root is gone: skip.
    const projectRoot = first.project_root ?? null;
    if (
      first.scope === "project" &&
      !(hasUsableProjectRoot(first) && isDirectory(first.project_root))
    )
      continue;

    const result = reexpandGroup({
      members,
      tap,
      home,
      projectRoot,
      cache,
      installedIndex,
      installOne,
      dryRun,
      namespaces: selection?.namespaces ?? null,
    });
    rows.push(...result.rows);
    updated.push(...result.updated);
    added.push(...result.added);
    for (const id of result.sourceGone) sourceGone.add(id);
    if (result.hardFailure) hardFailure = true;
  }

  return { added, updated, hardFailure, sourceGone, rows };
}
