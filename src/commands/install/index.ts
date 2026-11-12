/**
 * `crew install [<ref>...]` (§5.1).
 *
 * `installCommand` decides which kind of run this is and hands off.
 * `runOneInstall` is the install itself, a thin wrapper: it reads config,
 * takes its references from the command line or from the project manifest
 * (§9.2), runs the install flow, and hands the result to `./render/` for
 * human output.
 */

import { readConfig } from "../../config/load.ts";
import { CrewError } from "../../core/errors.ts";
import { runInstall } from "../../install/flow.ts";
import { UNUSABLE_PROJECT_ROOT_WARNING } from "../../install/metadata-warning.ts";
import { GitDiscoveryWarnings } from "../../sources/discovery.ts";
import { safePath } from "../../util/redact.ts";
import type { CommandContext, CommandOutput } from "../types.ts";
import { resolveCollisions } from "./collisions.ts";
import { installOutcome } from "./exit-code.ts";
import { readKindHint, rejectRecursiveTapRefs } from "./flags.ts";
import { normalizeFromGit } from "./from-git.ts";
import { withKnownTapInstallSuggestions } from "./known-tap-fallback/index.ts";
import { manifestForBareInstall, noAgentsOutcome, nothingToInstall } from "./manifest/index.ts";
import {
  hasAgentToInstallInto,
  latestLock,
  rejectLatestWithReferences,
  wantsLatest,
} from "./manifest/latest.ts";
import { readLock, refsToInstall } from "./manifest/lockfile.ts";
import { installEveryProject } from "./manifest/projects.ts";
import { EMPTY_RECONCILIATION, reconcileManifestInstalls } from "./manifest/reconcile.ts";
import { reportReconciliation } from "./manifest/report.ts";
import { saveThenInstall, wantsSave } from "./manifest/save.ts";
import { quietInstallFailures } from "./quiet.ts";
import { renderInstall } from "./render/index.ts";

/**
 * True when the command line names no reference. Which projects such a run
 * installs is decided by where the manifests are (§9.2), not here.
 */
function isBareInstall(ctx: CommandContext): boolean {
  return ctx.positional.length === 0 && typeof ctx.flags.extras["from-git"] !== "string";
}

export function installCommand(ctx: CommandContext): CommandOutput {
  // §9.2: `--save` edits one manifest, then installs that one project from it.
  if (wantsSave(ctx)) return saveThenInstall(ctx, runOneInstall);
  // §9.2: a bare install covers the governing manifest and every one beneath it.
  return isBareInstall(ctx) ? installEveryProject(ctx, runOneInstall) : runOneInstall(ctx);
}

/**
 * Install the references on the command line, or, for a bare install, the
 * single project whose manifest governs `ctx.cwd`. A caller installing
 * several projects passes `expectedManifestFile`, the manifest this run must find.
 */
export function runOneInstall(ctx: CommandContext, expectedManifestFile?: string): CommandOutput {
  const fromGit = ctx.flags.extras["from-git"];
  const isBare = isBareInstall(ctx);
  const manifest = isBare
    ? manifestForBareInstall(ctx, expectedManifestFile)
    : rejectLatestWithReferences(ctx);
  if (manifest?.entries.length === 0) {
    // §9.3: an invalid lockfile is an error even with nothing to install,
    // and before anything is removed.
    readLock(manifest);
    // §9.2: declaring nothing still drops whatever the manifest used to own.
    const reconciled = reconcileManifestInstalls(ctx, manifest, []);
    const human = `${safePath(manifest.file)} declares no skills.`;
    return nothingToInstall(manifest, ctx, human, reconciled);
  }
  const kindHint = readKindHint(ctx);
  rejectRecursiveTapRefs(ctx);
  const config = readConfig(ctx.home);
  const discovery = new GitDiscoveryWarnings();
  // §9.3: an invalid lockfile is an error before anything else is decided.
  const lock = manifest ? readLock(manifest) : null;
  // §9.3: `--latest` looks each unpinned line up on its remote, but only
  // once agents are selected: with none to install into, no source is touched.
  const isLatest = manifest !== null && lock !== null && wantsLatest(ctx);
  if (isLatest && !hasAgentToInstallInto(config, ctx)) return noAgentsOutcome(manifest, ctx);
  const latest = isLatest ? latestLock(manifest, lock) : undefined;
  // §9.3: a line with a lock entry installs at its recorded commit.
  const refs =
    manifest && lock
      ? refsToInstall(manifest, latest ?? lock)
      : resolveCollisions(ctx, config, discovery, kindHint);
  // §5.3: `--from-git` is never bare, so it skips collision resolution.
  if (typeof fromGit === "string") refs.push(normalizeFromGit(fromGit, ctx.cwd));
  // A manifest's skills belong to its project: relative paths resolve
  // against the manifest's directory, which is also the project root.
  const cwd = manifest?.projectRoot ?? ctx.cwd;
  const installOptions = {
    refs,
    scope: manifest ? ("project" as const) : ctx.flags.scope,
    force: ctx.flags.force,
    dryRun: ctx.flags.dryRun,
    restrictAgents: ctx.flags.agent,
    cwd,
    home: ctx.home,
    kindHint,
    recursive: Boolean(ctx.flags.extras["recursive"]),
    discovery,
  };
  let result: ReturnType<typeof runInstall>;
  try {
    result = runInstall(config, installOptions);
  } catch (err) {
    if (!(err instanceof CrewError)) throw err;
    // §9.2: `runInstall` selects agents before it acquires any source, so
    // this is reached with nothing fetched. Naming an agent with `--agent`
    // is a request for that agent, so it still fails as `no_agents`.
    const isBareInstall = manifest !== null;
    const noAgentRequested = ctx.flags.agent.length === 0;
    const noAgentActive = err.code === "no_agents";
    if (isBareInstall && noAgentRequested && noAgentActive) {
      return noAgentsOutcome(manifest, ctx);
    }
    throw withKnownTapInstallSuggestions(err, refs, config, cwd, kindHint);
  }

  const { everythingLanded, exitCode: installExitCode } = installOutcome(result);

  // §9.2, §9.3: the project is brought in line with the manifest — dropped
  // skills removed, ownership and the lockfile recorded — only once
  // everything declared has landed.
  const reconciled =
    manifest && everythingLanded
      ? reconcileManifestInstalls(ctx, manifest, result.resolved, latest)
      : EMPTY_RECONCILIATION;
  const reconciliation = reportReconciliation(reconciled, ctx);
  const exitCode = reconciliation.hasAbortedRemoval ? 1 : installExitCode;

  const human = [
    ...renderInstall(
      {
        records: result.summary.records,
        alreadyInstalled: result.alreadyInstalled,
        resolved: result.resolved,
        skipped: result.skipped,
        dryRun: ctx.flags.dryRun,
        cwd,
        width: ctx.width,
      },
      ctx.style,
    ),
    ...reconciliation.human,
  ];

  const warnings = [...discovery.warnings(), ...reconciliation.warnings];
  return {
    exitCode,
    human,
    stderr: [
      ...(result.unusableProjectRoots ? [UNUSABLE_PROJECT_ROOT_WARNING] : []),
      ...warnings,
      ...quietInstallFailures(result, ctx),
      ...reconciliation.quietDiagnostics,
    ],
    json: {
      already_installed: result.alreadyInstalled,
      records: result.summary.records,
      skipped: result.skipped,
      dry_run: ctx.flags.dryRun,
      ...(manifest ? { manifest_path: manifest.file, removed: reconciled.removed } : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
    },
  };
}
