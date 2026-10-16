/**
 * Per-group survey of a tap's current children during re-expansion
 * (§10.1.1 step 2).
 *
 * Split from `./index.ts` (200-line cap). Given the children a tap now
 * exposes and the entries installed from it, decide three things:
 * which names are ambiguous upstream, which installed entries have
 * vanished, and which have merely moved.
 */

import { lstatSync } from "node:fs";
import { join } from "node:path";
import { isGistTap } from "../../core/gist-url.ts";
import type { StateEntry, TapConfig } from "../../core/types.ts";
import { hasSkillMd } from "../../skill/load.ts";
import { entryIdentity } from "../../state/collections/index.ts";
import type { CurrentTapChild } from "../tap-children.ts";
import type { TapReexpandRow } from "./index.ts";

export interface SurveyInput {
  readonly members: readonly StateEntry[];
  readonly childrenByName: ReadonlyMap<string, CurrentTapChild[]>;
  readonly tap: TapConfig;
  /** The group's materialized tap root: the clone, or an export of its ref. */
  readonly rootDir: string;
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
  const { members, childrenByName, tap, rootDir } = input;
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

  const childPaths = new Set<string>();
  for (const locs of childrenByName.values())
    for (const c of locs) childPaths.add(c.tapRelativePath);
  for (const m of members) {
    if (conflictedNames.has(m.name)) continue;
    const child = childrenByName.get(m.name)?.[0];
    // §10.1.1 step 3: gone only when its skill is no longer there. One the
    // index dropped — no child at its path, though its SKILL.md is (one crew
    // won't follow, say) — is left to the per-skill update, which reports
    // why (§10.1). A child at its path under another name was renamed.
    if (!(child || childPaths.has(m.source.path)) && stillThere(rootDir, m.source.path, tap)) {
      continue;
    }
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

/** True when the member's recorded skill file, or its folder's `SKILL.md`, still has an entry. */
function stillThere(rootDir: string, tapRelativePath: string, tap: TapConfig): boolean {
  const location = join(rootDir, tapRelativePath);
  return isGistTap(tap) && tapRelativePath !== "" ? entryExists(location) : hasSkillMd(location);
}

function entryExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}
