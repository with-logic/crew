/**
 * Per-group survey of a tap's current children during re-expansion
 * (§10.1.1 step 2).
 *
 * Split from `./index.ts` (200-line cap). Given the children a tap now
 * exposes and the entries installed from it, decide three things:
 * which names are ambiguous upstream, which installed entries have
 * vanished, and which have merely moved.
 */

import type { StateEntry, TapConfig } from "../../core/types.ts";
import { entryIdentity } from "../../state/collections.ts";
import type { CurrentTapChild } from "../tap-children.ts";
import type { TapReexpandRow } from "./index.ts";

export interface SurveyInput {
  readonly members: readonly StateEntry[];
  readonly childrenByName: ReadonlyMap<string, CurrentTapChild[]>;
  readonly tap: TapConfig;
}

export interface SurveyResult {
  /** Names appearing at two or more paths upstream; skipped entirely. */
  readonly conflictedNames: ReadonlySet<string>;
  /** Entries whose upstream directory is gone, by full identity. */
  readonly sourceGone: ReadonlySet<string>;
  /** Entries whose upstream path moved, rewritten to the new path. */
  readonly relocated: readonly StateEntry[];
  readonly rows: readonly TapReexpandRow[];
  readonly hardFailure: boolean;
}

export function surveyGroup(input: SurveyInput): SurveyResult {
  const { members, childrenByName, tap } = input;
  const first = members[0]!;
  const rows: TapReexpandRow[] = [];
  const conflictedNames = new Set<string>();
  const sourceGone = new Set<string>();
  const relocated: StateEntry[] = [];
  let hardFailure = false;

  for (const [name, locs] of childrenByName) {
    if (locs.length < 2) continue;
    conflictedNames.add(name);
    hardFailure = true;
    rows.push({
      name,
      scope: first.scope,
      tap: tap.name,
      kind: "tap_error",
      error: {
        code: "conflicting_dependencies",
        message: `\`${name}\` appears multiple times in tap \`${tap.name}\` at ${locs.map((loc) => loc.tapRelativePath || "(root)").join(", ")}`,
      },
    });
  }

  for (const m of members) {
    if (conflictedNames.has(m.name)) continue;
    const child = childrenByName.get(m.name)?.[0];
    if (!child) {
      // Keyed by identity, not name: the same name can be installed
      // from another tap or at another scope, and that install is a
      // different thing that may still be present upstream.
      sourceGone.add(entryIdentity(m));
      rows.push({ name: m.name, scope: m.scope, tap: tap.name, kind: "source_gone" });
      continue;
    }
    if (child.tapRelativePath !== m.source.path) {
      relocated.push({ ...m, source: { ...m.source, path: child.tapRelativePath } });
    }
  }

  return { conflictedNames, sourceGone, relocated, rows, hardFailure };
}
