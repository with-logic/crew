/**
 * Walk one tracked tap revision and collect re-expansion outcomes
 * (§10.1.1). A revision crew can't acquire, or whose skills it can't list
 * (`skills/` unreadable, C-SPEC-18), fails this group alone: each member
 * is a `whole_tap` `tap_error` row, and the rest of the run proceeds.
 */

import { CrewError } from "../../core/errors.ts";
import type { StateEntry, TapConfig } from "../../core/types.ts";
import { type AcquiredTap, withAcquiredTap } from "../../sources/acquire/index.ts";
import { crewErrorNameOf } from "../../util/errno.ts";
import type { InstalledSourceIndex } from "../installed-lookup.ts";
import { groupChildrenByName, type TapChildren } from "../tap-children.ts";
import { collectAdditions } from "./additions.ts";
import type { TapScanCache } from "./scan-cache.ts";
import { surveyGroup } from "./survey.ts";
import { type InstallNewChild, reexpandErrorOf, type TapReexpandResult } from "./types.ts";
import { reportUnnamed } from "./unnamed.ts";

interface GroupInput {
  readonly members: readonly StateEntry[];
  readonly tap: TapConfig;
  readonly home: string;
  readonly projectRoot: string | null;
  readonly cache: TapScanCache;
  readonly installedIndex: InstalledSourceIndex;
  readonly installOne: InstallNewChild;
  readonly dryRun: boolean;
  readonly namespaces: ReadonlySet<string> | null;
}

export function reexpandGroup(input: GroupInput): TapReexpandResult {
  const first = input.members[0]!;
  let acquiredDone = false;
  try {
    const walk = (acquired: AcquiredTap): TapReexpandResult => {
      acquiredDone = true;
      return walkGroup(input, acquired);
    };
    if (first.ref === null || input.tap.kind === "path") {
      const acquired = input.cache.acquire(input.tap, input.home);
      return walk({ ...acquired, pinned: false });
    }
    return withAcquiredTap(input.tap, first.ref, input.home, walk);
  } catch (err) {
    if (acquiredDone) throw err;
    return groupFailure(input, err);
  }
}

/**
 * The group failing as a whole: a `whole_tap` `tap_error` row for each
 * member, carrying the failure's next step.
 */
function groupFailure(input: GroupInput, err: unknown): TapReexpandResult {
  const code = crewErrorNameOf(err, "source_unreachable");
  const error = reexpandErrorOf(code, err);
  return {
    added: [],
    updated: [],
    sourceGone: new Set(),
    hardFailure: code !== "no_skills_found" && code !== "invalid_ref",
    rows: input.members.map((m) => ({
      name: m.name,
      scope: m.scope,
      tap: input.tap.name,
      kind: "tap_error",
      whole_tap: true,
      error,
    })),
  };
}

function walkGroup(input: GroupInput, acquired: AcquiredTap): TapReexpandResult {
  const { members, tap, home, projectRoot, cache } = input;
  const first = members[0]!;
  let scan: TapChildren;
  try {
    scan = cache.children(tap, home, acquired.rootDir);
  } catch (err) {
    // A child set crew can't list is `source_unreachable` (C-SPEC-18);
    // nothing of this group is installed yet, so it fails alone. Anything
    // else is crew's own bug, and surfaces as one.
    if (!(err instanceof CrewError)) throw err;
    return groupFailure(input, err);
  }
  const { children, unnamed } = scan;
  const childrenByName = groupChildrenByName(children);
  const survey = surveyGroup({ members, childrenByName, tap, rootDir: acquired.rootDir });
  const additions = collectAdditions({
    children,
    conflictedNames: survey.conflictedNames,
    memberNames: new Set(members.map((m) => m.name)),
    scope: first.scope,
    tap,
    agents: [...new Set(members.flatMap((m) => m.agents))],
    resolvedSha: acquired.resolvedSha,
    projectRoot,
    dryRun: input.dryRun,
    installOne: input.installOne,
    cache,
    namespaces: input.namespaces,
    installedIndex: input.installedIndex,
    ref: first.ref,
    pinned: acquired.pinned,
  });
  // §10.1.1 step 2: a candidate the index couldn't name fails like one that
  // fails validation, rather than vanishing from the run.
  const unnamedRows = reportUnnamed({
    unnamed,
    members,
    scope: first.scope,
    tap,
    namespaces: input.namespaces,
  });
  return {
    added: additions.added,
    updated: survey.relocated,
    sourceGone: survey.sourceGone,
    rows: [...survey.rows, ...additions.rows, ...unnamedRows],
    hardFailure: survey.hardFailure || additions.hardFailure || unnamedRows.length > 0,
  };
}
