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
 * Decided before agents are selected or any source is touched, so it
 * succeeds on a machine with no agent at all.
 */
export function nothingToInstall(
  manifest: Manifest,
  ctx: CommandContext,
  human: string,
): CommandOutput {
  return {
    exitCode: 0,
    human: [human],
    json: {
      already_installed: [],
      records: [],
      skipped: [],
      dry_run: ctx.flags.dryRun,
      manifest_path: manifest.file,
    },
  };
}
