/** Walk one tracked tap revision and collect re-expansion outcomes (§10.1.1). */

import type { CrewError } from "../../core/errors.ts";
import type { StateEntry, TapConfig } from "../../core/types.ts";
import { type AcquiredTap, withAcquiredTap } from "../../sources/acquire/index.ts";
import type { InstalledSourceIndex } from "../installed-lookup.ts";
import { groupChildrenByName } from "../tap-children.ts";
import { collectAdditions } from "./additions.ts";
import type { TapScanCache } from "./scan-cache.ts";
import { surveyGroup } from "./survey.ts";
import type { InstallNewChild, TapReexpandResult } from "./types.ts";

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
    const ce = err as CrewError;
    return {
      added: [],
      updated: [],
      sourceGone: new Set(),
      hardFailure: ce.code !== "no_skills_found" && ce.code !== "invalid_ref",
      rows: input.members.map((m) => ({
        name: m.name,
        scope: m.scope,
        tap: input.tap.name,
        kind: "tap_error",
        error: { code: ce.code ?? "source_unreachable", message: ce.message },
      })),
    };
  }
}

function walkGroup(input: GroupInput, acquired: AcquiredTap): TapReexpandResult {
  const { members, tap, home, projectRoot, cache } = input;
  const first = members[0]!;
  const children = cache.children(tap, home, acquired.rootDir);
  const survey = surveyGroup({ members, childrenByName: groupChildrenByName(children), tap });
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
  return {
    added: additions.added,
    updated: survey.relocated,
    sourceGone: survey.sourceGone,
    rows: [...survey.rows, ...additions.rows],
    hardFailure: survey.hardFailure || additions.hardFailure,
  };
}
