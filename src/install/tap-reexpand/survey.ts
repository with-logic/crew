/**
 * Per-group survey of a tap's current children during re-expansion
 * (§10.1.1 steps 1 and 3).
 *
 * Split from `./index.ts` (200-line cap). Given the children a tap now
 * exposes, the entries installed from it, and the materialized tree,
 * decide which names are ambiguous upstream, which installed entries
 * have vanished, which have merely moved, and which are still there but
 * weren't indexed — left to their own update to report why.
 */

import { lstatSync } from "node:fs";
import { join } from "node:path";
import { isGistTap } from "../../core/gist-url.ts";
import type { StateEntry, TapConfig } from "../../core/types.ts";
import { isGistSkillCandidate } from "../../sources/gist.ts";
import { entryIdentity } from "../../state/collections/index.ts";
import { isGoneError } from "../../util/errno.ts";
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
  /** Entries whose skill is no longer upstream (§10.1.1 step 3), by full identity. */
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
  for (const member of members) {
    // A gist file installed on its own (`//<file>`, by name, as a
    // dependency) is judged by its own update, at its recorded file
    // exactly (§10.1, C-UPD-39), as when nothing beside it tracks the gist.
    if (isGistTap(tap) && member.tracks_tap !== true && member.source.path !== "") continue;
    if (conflictedNames.has(member.name)) continue;
    const child = childrenByName.get(member.name)?.[0];
    // §10.1.1 step 3: gone only when its skill is no longer there. One the
    // index dropped — no child at its path, though its SKILL.md is (one crew
    // won't follow, say) — is left to the per-skill update, which reports
    // why (§10.1). A child at its path under another name was renamed.
    const indexedHere = child !== undefined || childPaths.has(member.source.path);
    if (!indexedHere && skillStillThere(rootDir, member.source.path, tap)) continue;
    if (!child) {
      // Keyed by identity, not name: the same name can be installed
      // from another tap or at another scope, and that install is a
      // different thing that may still be present upstream.
      sourceGone.add(entryIdentity(member));
      rows.push({ name: member.name, scope: member.scope, tap: tap.name, kind: "source_gone" });
      continue;
    }
    if (child.tapRelativePath !== member.source.path) {
      relocated.push({ ...member, source: { ...member.source, path: child.tapRelativePath } });
    }
  }

  return { conflictedNames, sourceGone, relocated, rows, hardFailure };
}

/**
 * True when the member's recorded skill is still there to update
 * (§10.1.1 step 3): a gist skill file, or a folder's `SKILL.md` entry.
 * Only a gone error says a folder's isn't: one crew can't search is still
 * there, for its own update to report.
 */
function skillStillThere(rootDir: string, tapRelativePath: string, tap: TapConfig): boolean {
  const location = join(rootDir, tapRelativePath);
  // A file of a gist tracked whole is a skill only while it opens
  // frontmatter (§9 step 5), though one crew can't read still counts.
  if (isGistTap(tap) && tapRelativePath !== "") return isGistSkillCandidate(location);
  try {
    lstatSync(join(location, "SKILL.md"));
    return true;
  } catch (err) {
    return !isGoneError(err);
  }
}
