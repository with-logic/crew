/**
 * `crew install [<ref>...]` (§5.1).
 *
 * Thin command wrapper: reads config, takes its references from the
 * command line or from the project manifest (§9.2), runs the install
 * flow, and hands the result to `./render/` for human output.
 */

import { readConfig } from "../../config/load.ts";
import { CrewError } from "../../core/errors.ts";
import { detectActiveAgents } from "../../install/agent-set.ts";
import { runInstall } from "../../install/flow.ts";
import { UNUSABLE_PROJECT_ROOT_WARNING } from "../../install/metadata-warning.ts";
import type { KindHint } from "../../install/resolve-ref/index.ts";
import { parseRef } from "../../refs/parse.ts";
import { GitDiscoveryWarnings } from "../../sources/discovery.ts";
import { safePath } from "../../util/redact.ts";
import type { CommandContext, CommandOutput } from "../types.ts";
import { resolveCollisions } from "./collisions.ts";
import { normalizeFromGit } from "./from-git.ts";
import { withKnownTapInstallSuggestions } from "./known-tap-fallback/index.ts";
import { manifestForBareInstall, noAgentsOutcome, nothingToInstall } from "./manifest/index.ts";
import {
  IN_STEP_WITH_MANIFEST,
  reconcileOwnership,
  staleManifestWarnings,
} from "./manifest/reconcile.ts";
import { renderInstall } from "./render/index.ts";

/** Read --tap / --bundle / --skill, enforce mutual exclusivity. */
function readKindHint(ctx: CommandContext): KindHint {
  const tap = Boolean(ctx.flags.extras["tap"]);
  const bundle = Boolean(ctx.flags.extras["bundle"]);
  const skill = Boolean(ctx.flags.extras["skill"]);
  const count = Number(tap) + Number(bundle) + Number(skill);
  if (count > 1) {
    throw new CrewError(
      "usage_error",
      "`--tap`, `--bundle`, and `--skill` are mutually exclusive — pick one",
    );
  }
  if (tap) return "tap";
  if (bundle) return "namespace";
  if (skill) return "skill";
  return null;
}

export function installCommand(ctx: CommandContext): CommandOutput {
  const fromGit = ctx.flags.extras["from-git"];
  // §9.2: with nothing named on the command line, the project's manifest names the skills.
  const isBare = ctx.positional.length === 0 && typeof fromGit !== "string";
  const manifest = isBare ? manifestForBareInstall(ctx) : null;
  if (manifest?.entries.length === 0) {
    return nothingToInstall(manifest, ctx, `${safePath(manifest.file)} declares no skills.`);
  }
  const kindHint = readKindHint(ctx);
  rejectRecursiveTapRefs(ctx);
  const config = readConfig(ctx.home);
  // §9.2: checked before any source is acquired. Naming an agent with
  // `--agent` is a request for that agent, so it still fails as `no_agents`.
  const noAgentRequested = ctx.flags.agent.length === 0;
  if (manifest && noAgentRequested && detectActiveAgents(config).length === 0) {
    return noAgentsOutcome(manifest, ctx);
  }
  const discovery = new GitDiscoveryWarnings();
  const refs = manifest
    ? manifest.entries.map((entry) => entry.ref)
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
    throw withKnownTapInstallSuggestions(err, refs, config, cwd, kindHint);
  }

  // Exit-code rules (PRD §9 step 9). Per-skill outcome is
  // "succeeded" iff the skill validated AND at least one agent
  // install succeeded. Validation failures land in result.skipped;
  // agent-level failures live in result.summary.records with
  // `anySuccess === false`.
  const succeeded = result.summary.records.filter((r) => r.anySuccess).length;
  const operationalFailures = result.summary.records.filter((r) => !r.anySuccess).length;
  const validationFailures = result.skipped.length;
  const failed = operationalFailures + validationFailures;
  const allAlreadyInstalled =
    result.alreadyInstalled.length > 0 && result.summary.records.length === 0;
  let exitCode = 0;
  if (failed === 0) {
    exitCode = 0; // Every attempted skill succeeded, or nothing to do.
  } else if (succeeded > 0 || allAlreadyInstalled) {
    exitCode = 1; // Partial success.
  } else if (validationFailures > 0) {
    exitCode = 4; // Zero succeeded; at least one invalid skill.
  } else {
    exitCode = 1; // Zero succeeded; purely operational failures.
  }

  // §9.2: the manifest owns what it resolved to — but only once all of it
  // has landed, and never on a dry run.
  const noInstallFailures = failed === 0;
  const mayWriteState = !ctx.flags.dryRun;
  const reconciled =
    manifest && noInstallFailures && mayWriteState
      ? reconcileOwnership({
          home: ctx.home,
          manifest,
          resolvedSkillNames: new Set(result.resolved.map((skill) => skill.name)),
        })
      : IN_STEP_WITH_MANIFEST;

  const human = renderInstall(
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
  );

  const warnings = [...discovery.warnings(), ...staleManifestWarnings(reconciled)];
  return {
    exitCode,
    human,
    stderr: result.unusableProjectRoots ? [UNUSABLE_PROJECT_ROOT_WARNING, ...warnings] : warnings,
    json: {
      already_installed: result.alreadyInstalled,
      records: result.summary.records,
      skipped: result.skipped,
      dry_run: ctx.flags.dryRun,
      ...(manifest ? { manifest_path: manifest.file } : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
    },
  };
}

function rejectRecursiveTapRefs(ctx: CommandContext): void {
  if (!ctx.flags.extras["recursive"]) return;
  for (const raw of ctx.positional) {
    const source = parseRef(raw, ctx.cwd);
    if (source.type !== "tap") continue;
    throw new CrewError(
      "usage_error",
      "`--recursive` only applies to direct git or path sources — for tap-name installs, run `crew tap add --recursive <url-or-path> <name>` first",
    );
  }
}
