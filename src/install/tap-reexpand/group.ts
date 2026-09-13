/**
 * Per-group passes for tap re-expansion (§10.1.1).
 *
 * A "group" is the set of state entries sharing a (tap, scope,
 * project_root). Each group is walked in three passes: duplicate child
 * names are rejected outright, members missing upstream are reported as
 * `source_gone`, and upstream children absent from state are installed.
 */

import type { StateEntry, TapConfig } from "../../core/types.ts";
import type { InstalledSourceIndex } from "../installed-lookup.ts";
import { indexHasSameSource, noteInstalled } from "../installed-lookup.ts";
import type { CurrentTapChild } from "../tap-children.ts";
import type { InstallNewChild, ReexpandSink } from "./types.ts";

/**
 * Names appearing at more than one location in the tap. A duplicate is a
 * hard failure: crew cannot tell which directory the user meant, and
 * installing either would silently pick one.
 */
export function rejectConflictingNames(
  childrenByName: ReadonlyMap<string, readonly CurrentTapChild[]>,
  tap: TapConfig,
  groupScope: StateEntry["scope"],
  sink: ReexpandSink,
): Set<string> {
  const conflicted = new Set<string>();
  for (const [name, locs] of childrenByName) {
    if (locs.length < 2) continue;
    conflicted.add(name);
    const where = locs.map((loc) => loc.tapRelativePath || "(root)").join(", ");
    sink.rows.push({
      name,
      scope: groupScope,
      tap: tap.name,
      kind: "tap_error",
      error: {
        code: "conflicting_dependencies",
        message: `\`${name}\` appears multiple times in tap \`${tap.name}\` at ${where}`,
      },
    });
  }
  return conflicted;
}

/**
 * Members no longer present upstream are reported (the local install is
 * preserved); members that merely moved have their recorded path
 * corrected.
 */
export function reportMissingMembers(
  members: readonly StateEntry[],
  childrenByName: ReadonlyMap<string, readonly CurrentTapChild[]>,
  conflicted: ReadonlySet<string>,
  tap: TapConfig,
  sink: ReexpandSink,
): void {
  for (const m of members) {
    if (conflicted.has(m.name)) continue;
    const child = childrenByName.get(m.name)?.[0];
    if (!child) {
      sink.sourceGone.add(m.name);
      sink.rows.push({ name: m.name, scope: m.scope, tap: tap.name, kind: "source_gone" });
      continue;
    }
    if (child.tapRelativePath !== m.source.path) {
      sink.updated.push({ ...m, source: { ...m.source, path: child.tapRelativePath } });
    }
  }
}

/** Install upstream children that state doesn't know about yet. */
export function installNewChildren(
  children: readonly CurrentTapChild[],
  members: readonly StateEntry[],
  conflicted: ReadonlySet<string>,
  ctx: {
    readonly tap: TapConfig;
    readonly scope: StateEntry["scope"];
    readonly projectRoot: string | null;
    readonly resolvedSha: string | null;
    readonly installedIndex: InstalledSourceIndex;
    readonly installOne: InstallNewChild;
  },
  sink: ReexpandSink,
): void {
  const memberNames = new Set(members.map((m) => m.name));
  const aggregateTargets = [...new Set(members.flatMap((m) => m.agents))];
  for (const child of children) {
    if (conflicted.has(child.name)) continue;
    if (memberNames.has(child.name)) continue;
    // §5.4: the same directory may already be installed through another
    // tap pointing at this repo. Same source, so there is nothing to add
    // — installing again would collide on the name.
    const lookup = {
      name: child.name,
      scope: ctx.scope,
      projectRoot: ctx.projectRoot,
      tap: ctx.tap,
      tapRelativePath: child.tapRelativePath,
    };
    if (indexHasSameSource(ctx.installedIndex, lookup)) continue;
    const entry = ctx.installOne({
      skillDir: child.path,
      skillName: child.name,
      tapRelativePath: child.tapRelativePath,
      scope: ctx.scope,
      tap: ctx.tap,
      agents: aggregateTargets,
      resolvedSha: ctx.resolvedSha,
      projectRoot: ctx.projectRoot,
    });
    if (entry) {
      sink.added.push(entry);
      // Keep the index current: another tap row pointing at this same
      // repo forms its own group, and must not add this child again.
      noteInstalled(ctx.installedIndex, lookup);
      sink.rows.push({ name: child.name, scope: ctx.scope, tap: ctx.tap.name, kind: "added" });
    }
  }
}
