/**
 * Per-group tap re-expansion (§10.1.1 steps 1–3).
 *
 * One group is a set of state entries sharing tap, scope, project_root
 * and ref. This module walks that group's tap AT THE GROUP'S REF and
 * records additions, path moves, and `source_gone` outcomes into the
 * caller's accumulator.
 *
 * The ref matters: a group installed at `@v1` must be re-expanded
 * against v1's tree. Walking the default branch instead would discover
 * children that do not exist at the revision the group tracks and record
 * them as unpinned entries with no ref (§10.1.1, §11.1).
 */

import type { CrewError } from "../../core/errors.ts";
import type { StateEntry, TapConfig } from "../../core/types.ts";
import { type AcquiredTap, withAcquiredTap } from "../../sources/acquire/index.ts";
import { currentTapChildren, groupChildrenByName } from "../tap-children.ts";
import type { InstallNewChild, ReexpandAccumulator } from "./types.ts";

/** Walk one group's tap at the group's ref and record every outcome. */
export function reexpandGroup(
  members: readonly StateEntry[],
  tap: TapConfig,
  home: string,
  projectRoot: string | null,
  acc: ReexpandAccumulator,
  installOne: InstallNewChild,
): void {
  const first = members[0]!;
  // Every member of a group shares a ref by construction of the group key.
  const ref = first.ref;
  // Only ACQUISITION failures are isolated into per-group rows: a tap
  // that can't be materialized contributes nothing and the other groups
  // still update. A failure inside the walk is not a per-tap condition
  // and keeps escaping to the caller, as before.
  let acquisitionDone = false;
  try {
    withAcquiredTap(tap, ref, home, (acquired) => {
      acquisitionDone = true;
      return walk(members, tap, home, acquired, projectRoot, acc, installOne);
    });
  } catch (err) {
    if (acquisitionDone) throw err;
    const ce = err as CrewError;
    for (const m of members) {
      acc.rows.push({
        name: m.name,
        scope: m.scope,
        tap: tap.name,
        kind: "tap_error",
        error: { code: ce.code ?? "source_unreachable", message: ce.message },
      });
    }
  }
}

function walk(
  members: readonly StateEntry[],
  tap: TapConfig,
  home: string,
  acquired: AcquiredTap,
  projectRoot: string | null,
  acc: ReexpandAccumulator,
  installOne: InstallNewChild,
): void {
  const first = members[0]!;
  const children = currentTapChildren(tap, home, acquired.rootDir);
  const childrenByName = groupChildrenByName(children);

  const conflictedNames = new Set<string>();
  for (const [name, locs] of childrenByName) {
    if (locs.length < 2) continue;
    conflictedNames.add(name);
    acc.hardFailure = true;
    acc.rows.push({
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

  // SOURCE_GONE: members no longer present upstream.
  for (const m of members) {
    if (conflictedNames.has(m.name)) continue;
    const child = childrenByName.get(m.name)?.[0];
    if (!child) {
      acc.sourceGone.add(m.name);
      acc.rows.push({ name: m.name, scope: m.scope, tap: tap.name, kind: "source_gone" });
      continue;
    }
    if (child.tapRelativePath !== m.source.path) {
      acc.updated.push({ ...m, source: { ...m.source, path: child.tapRelativePath } });
    }
  }

  // ADDITIONS: children at this revision that aren't in state.
  const memberNames = new Set(members.map((m) => m.name));
  const aggregateTargets = [...new Set(members.flatMap((m) => m.agents))];
  for (const child of children) {
    if (conflictedNames.has(child.name)) continue;
    if (memberNames.has(child.name)) continue;
    const entry = installOne({
      skillDir: child.path,
      skillName: child.name,
      tapRelativePath: child.tapRelativePath,
      scope: first.scope,
      tap,
      agents: aggregateTargets,
      resolvedSha: acquired.resolvedSha,
      projectRoot,
      ref: first.ref,
      pinned: acquired.pinned,
    });
    if (entry) {
      acc.added.push(entry);
      acc.rows.push({ name: child.name, scope: first.scope, tap: tap.name, kind: "added" });
    }
  }
}
