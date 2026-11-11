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
import type { CommandContext, CommandOutput } from "../../types.ts";
import { renderDropped } from "../render/dropped.ts";
import { type Reconciliation, staleManifestWarnings } from "./reconcile.ts";

/** Flags that reinterpret references; meaningless without references on the command line. */
const REFERENCE_FLAGS = ["recursive", "tap", "bundle", "skill"] as const;

/** Load the manifest governing `ctx.cwd`, or fail with the usage error a bare install earns. */
export function manifestForBareInstall(ctx: CommandContext): Manifest {
  const manifest = loadManifestFor(ctx.cwd);
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
 * touched, so it needs no agent. Removing what the manifest used to own
 * still runs, so the exit code is 1 when one of those removals aborts.
 */
export function nothingToInstall(
  manifest: Manifest,
  ctx: CommandContext,
  human: string,
  reconciled: Reconciliation,
): CommandOutput {
  const { removed } = reconciled;
  const warnings = staleManifestWarnings(reconciled);
  return {
    exitCode: removed.some((record) => record.failures.length > 0) ? 1 : 0,
    human: [human, ...renderDropped(removed, ctx)],
    stderr: warnings,
    json: {
      already_installed: [],
      records: [],
      skipped: [],
      dry_run: ctx.flags.dryRun,
      manifest_path: manifest.file,
      removed,
      ...(warnings.length > 0 ? { warnings } : {}),
    },
  };
}
