/**
 * Bare `crew install` (§9.2): with no references on the command line,
 * the project's manifest supplies them.
 *
 * A manifest means the same thing wherever it is read, so the flags that
 * change how a reference is interpreted are rejected here rather than
 * applied to every line.
 */

import { CrewError } from "../../../core/errors.ts";
import { loadManifestFor, MANIFEST_FILENAME, type Manifest } from "../../../manifest/index.ts";
import { safePath } from "../../../util/redact.ts";
import type { CommandContext, CommandOutput } from "../../types.ts";
import { EMPTY_RECONCILIATION, type Reconciliation } from "./reconcile.ts";
import { reportReconciliation } from "./report.ts";

/** Flags that reinterpret references; meaningless without references on the command line. */
const REFERENCE_FLAGS = ["recursive", "tap", "bundle", "skill"] as const;

/**
 * Load the manifest governing `ctx.cwd`, or fail with the usage error a
 * bare install earns. `expectedManifestFile` does not choose the manifest:
 * it is checked against the one found, which must be that file.
 */
export function manifestForBareInstall(
  ctx: Pick<CommandContext, "cwd" | "flags">,
  expectedManifestFile?: string,
): Manifest {
  const manifest = loadManifestFor(ctx.cwd);
  // A run over several projects names the manifest each install must find
  // (§9.2). Finding another, or none, means it changed underneath the run.
  if (expectedManifestFile !== undefined && manifest?.file !== expectedManifestFile) {
    throw new CrewError(
      "manifest_invalid",
      `${expectedManifestFile} is no longer the manifest for its directory`,
      { file: expectedManifestFile },
    );
  }
  if (manifest === null) {
    throw new CrewError(
      "usage_error",
      `\`crew install\` needs at least one skill reference — e.g. \`crew install python-testing\`, \`crew install @acme/skills\`, or \`crew install ./my-skill\` — or a \`${MANIFEST_FILENAME}\` in this project listing them`,
    );
  }
  if (ctx.flags.scopeGiven && ctx.flags.scope === "user") {
    throw new CrewError(
      "usage_error",
      `\`crew install\` with no references installs the skills listed in \`${MANIFEST_FILENAME}\` at project scope — \`--scope user\` needs explicit references`,
    );
  }
  for (const flag of REFERENCE_FLAGS) {
    if (!ctx.flags.extras[flag]) continue;
    throw new CrewError(
      "usage_error",
      `\`--${flag}\` only applies to references given on the command line, not to \`${MANIFEST_FILENAME}\``,
    );
  }
  return manifest;
}

/**
 * The outcome of a bare install that has nothing to install (§9.2).
 * Installing is decided before agents are selected or any source is
 * touched, so it needs no agent. `reconciled` is what removing the skills
 * the manifest used to own did; the exit code is 1 when one of those removals
 * aborted.
 */
export function nothingToInstall(
  manifest: Manifest,
  ctx: CommandContext,
  human: string,
  reconciled: Reconciliation = EMPTY_RECONCILIATION,
): CommandOutput {
  const report = reportReconciliation(reconciled, ctx);
  return {
    exitCode: report.hasAbortedRemoval ? 1 : 0,
    human: [human, ...report.human],
    stderr: [...report.warnings, ...report.quietDiagnostics],
    json: {
      already_installed: [],
      records: [],
      skipped: [],
      dry_run: ctx.flags.dryRun,
      manifest_path: manifest.file,
      removed: reconciled.removed,
      ...(report.warnings.length > 0 ? { warnings: report.warnings } : {}),
    },
  };
}

/**
 * The outcome of a bare install on a machine with no active agent (§9.2).
 *
 * A project's setup step runs `crew install` everywhere, including CI
 * runners that have no agent and often no access to the skill sources.
 * There is nothing to install into, so this succeeds without touching one.
 */
export function noAgentsOutcome(manifest: Manifest, ctx: CommandContext): CommandOutput {
  const human = `No active agent coders — nothing to install from ${safePath(manifest.file)}.`;
  const outcome = nothingToInstall(manifest, ctx, human);
  return { ...outcome, json: { ...(outcome.json as object), no_agents: true } };
}
