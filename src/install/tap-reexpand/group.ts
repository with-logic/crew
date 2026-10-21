/** Walk one tracked tap revision and collect re-expansion outcomes (§10.1.1). */

import type { TargetBaseFailures } from "../../agents/target-lock/index.ts";
import type { CrewError } from "../../core/errors.ts";
import type { StateEntry, TapConfig } from "../../core/types.ts";
import { type AcquiredTap, withAcquiredTap } from "../../sources/acquire/index.ts";
import type { PreparedSources } from "../../sources/acquire/revision.ts";
import { hasExportCleanupFailure } from "../../util/export-cleanup.ts";
import { isSourceReadFailure } from "../../util/source-read.ts";
import type { InstalledSourceIndex } from "../installed-lookup.ts";
import { type CurrentTapCatalog, groupChildrenByName } from "../tap-children.ts";
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
  readonly prepared?: PreparedSources;
  readonly baseFailures?: TargetBaseFailures;
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
    return withAcquiredTap(input.tap, first.ref, input.home, walk, input.prepared);
  } catch (err) {
    if (acquiredDone) throw err;
    const ce = err as CrewError;
    return failedGroup(input, ce);
  }
}

function walkGroup(input: GroupInput, acquired: AcquiredTap): TapReexpandResult {
  const { members, tap, home, projectRoot, cache } = input;
  const first = members[0]!;
  let catalog: CurrentTapCatalog;
  try {
    catalog = cache.children(tap, home, acquired.rootDir);
  } catch (err) {
    // §10.1: an inaccessible source cannot establish deletion or stop other groups.
    if (isSourceReadFailure(err)) return failedGroup(input, err);
    throw err;
  }
  const survey = surveyGroup({
    members,
    childrenByName: groupChildrenByName(catalog.children),
    skipped: catalog.skipped,
    rootDir: acquired.rootDir,
    namespaces: input.namespaces,
    tap,
  });
  const additions = collectAdditions({
    children: catalog.children,
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
    ...(input.baseFailures ? { baseFailures: input.baseFailures } : {}),
  });
  return {
    added: additions.added,
    updated: survey.relocated,
    sourceGone: survey.sourceGone,
    rows: [...survey.rows, ...additions.rows],
    hardFailure: survey.hardFailure || additions.hardFailure,
  };
}

function failedGroup(input: GroupInput, error: CrewError): TapReexpandResult {
  const hasCleanupFailure = hasExportCleanupFailure(error);
  const isSoftSourceError = error.code === "no_skills_found" || error.code === "invalid_ref";
  return {
    added: [],
    updated: [],
    sourceGone: new Set(),
    hardFailure: hasCleanupFailure || !isSoftSourceError,
    rows: input.members.map((member) => ({
      name: member.name,
      scope: member.scope,
      tap: input.tap.name,
      kind: "tap_error",
      error: { code: error.code ?? "source_unreachable", message: error.message },
    })),
  };
}
