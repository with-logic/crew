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
import { displayText } from "../../refs/display-url.ts";
import { entryIdentity } from "../../state/collections/index.ts";
import { sanitizeLine } from "../../util/redact.ts";
import type { CurrentTapChild } from "../tap-children.ts";
import type { RejectedTapSkill } from "../tap-index.ts";
import type { TapReexpandRow } from "./index.ts";

export interface SurveyInput {
  readonly members: readonly StateEntry[];
  readonly childrenByName: ReadonlyMap<string, CurrentTapChild[]>;
  readonly tap: TapConfig;
  readonly skipped: readonly RejectedTapSkill[];
  readonly namespaces: ReadonlySet<string> | null;
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

  const rejectedPaths = new Set<string>();
  for (const rejected of input.skipped) {
    rejectedPaths.add(rejected.tapRelativePath);
    if (
      input.namespaces !== null &&
      (rejected.namespace === null || !input.namespaces.has(rejected.namespace))
    )
      continue;
    hardFailure = true;
    rows.push({
      name: tap.name,
      scope: first.scope,
      ...(first.scope === "project" && first.project_root
        ? { project_root: first.project_root }
        : {}),
      tap: tap.name,
      kind: "tap_error",
      error: {
        code: rejected.code,
        message: sanitizeLine(
          displayText(
            `invalid skill at \`${rejected.tapRelativePath || "(root)"}\`: ${rejected.message}`,
          ),
        ),
      },
    });
  }

  for (const [name, locs] of childrenByName) {
    if (locs.length < 2) continue;
    conflictedNames.add(name);
    hardFailure = true;
    rows.push({
      name,
      scope: first.scope,
      ...(first.scope === "project" && first.project_root
        ? { project_root: first.project_root }
        : {}),
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
      // §10.1.1 step 4: rejected metadata does not establish upstream deletion.
      if (rejectedPaths.has(m.source.path)) continue;
      // Keyed by identity, not name: the same name can be installed
      // from another tap or at another scope, and that install is a
      // different thing that may still be present upstream.
      sourceGone.add(entryIdentity(m));
      rows.push({
        name: m.name,
        scope: m.scope,
        ...(m.scope === "project" && m.project_root ? { project_root: m.project_root } : {}),
        tap: tap.name,
        kind: "source_gone",
      });
      continue;
    }
    if (child.tapRelativePath !== m.source.path) {
      relocated.push({ ...m, source: { ...m.source, path: child.tapRelativePath } });
    }
  }

  return { conflictedNames, sourceGone, relocated, rows, hardFailure };
}
