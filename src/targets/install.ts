/**
 * Target install / uninstall operations (§7.3, §7.4).
 *
 * These are adapter-independent: the adapter only supplies the base path
 * for the scope, and these functions run the staging, safety checks, and
 * marker writes uniformly.
 */

import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { CrewError } from "../core/errors.ts";
import type { Marker, Scope, TapConfig } from "../core/types.ts";
import { CREW_INSTALLED_BY } from "../core/version.ts";
import { hashDirectory } from "../hash/content.ts";
import { copyTree } from "../util/copy.ts";
import { atomicReplace, ensureDir, exists, rmrf } from "../util/fs.ts";
import { tryReadJson, writeJson } from "../util/json.ts";
import { nowIso } from "../util/time.ts";
import { baseFor, type TargetAdapter } from "./adapter.ts";

/** Input to the install operation. */
export interface InstallInput {
  readonly adapter: TargetAdapter;
  readonly scope: Scope;
  readonly cwd: string;
  readonly storePath: string;
  readonly skillName: string;
  /** Tap that owns this skill — written into the marker for self-description. */
  readonly tap: TapConfig;
  /** Skill's location relative to the tap root. */
  readonly tapRelativePath: string;
  readonly ref: string | null;
  readonly resolvedSha: string | null;
  readonly contentHash: string;
  readonly force: boolean;
}

/** Outcome of one target install. */
export type InstallOutcome = { kind: "installed" } | { kind: "up_to_date" };

/**
 * Install a staged skill into one target, performing all safety checks.
 * Throws `CrewError` on abort (unless --force overrides the check).
 */
export function installSkillIntoTarget(input: InstallInput): InstallOutcome {
  const base = baseFor(input.adapter, input.scope, input.cwd);
  ensureDir(base, 0o755);
  const dest = join(base, input.skillName);

  if (existsSync(dest)) {
    const existingMarker = tryReadJson<Marker>(join(dest, ".crew.json"));
    if (existingMarker) {
      if (existingMarker.name === input.skillName) {
        const currentHash = hashDirectory(dest);
        if (currentHash !== existingMarker.content_hash) {
          if (!input.force)
            throw new CrewError(
              "customized",
              `\`${input.skillName}\` has local edits at \`${dest}\` — leaving them alone`,
              {
                dest,
                expected: existingMarker.content_hash,
                actual: currentHash,
              },
            );
        }
        // Same hash, same name, same resolved SHA → up-to-date, no-op.
        if (
          existingMarker.resolved_sha === input.resolvedSha &&
          existingMarker.content_hash === input.contentHash &&
          !input.force
        )
          return { kind: "up_to_date" };
      } else if (!input.force) {
        throw new CrewError(
          "inconsistent_marker",
          `\`${dest}\` has a crew marker for \`${existingMarker.name}\` but we're installing \`${input.skillName}\` — investigate before forcing`,
          { dest, existingName: existingMarker.name, incomingName: input.skillName },
        );
      }
    } else if (!input.force) {
      throw new CrewError(
        "untracked_directory",
        `\`${dest}\` exists but wasn't installed by crew (no .crew.json marker)`,
        { dest },
      );
    }
  }

  // Stage + atomic rename so a crash never leaves a half-copied directory.
  const staging = join(dirname(dest), `.crew-staging-${basename(dest)}-${Date.now()}`);
  if (exists(staging)) rmrf(staging);
  copyTree(input.storePath, staging, { stripRootMarker: true });

  const marker: Marker = {
    schema_version: 1,
    name: input.skillName,
    tap_name: input.tap.name,
    tap_kind: input.tap.kind,
    tap_url: input.tap.url,
    tap_subpath: input.tap.subpath,
    tap_path: input.tap.path,
    path: input.tapRelativePath,
    ref: input.ref,
    resolved_sha: input.resolvedSha,
    content_hash: input.contentHash,
    scope: input.scope,
    installed_at: nowIso(),
    installed_by: CREW_INSTALLED_BY,
  };
  writeJson(join(staging, ".crew.json"), marker);

  atomicReplace(staging, dest);
  return { kind: "installed" };
}

/** Input to uninstall from one target. */
export interface UninstallInput {
  readonly adapter: TargetAdapter;
  readonly scope: Scope;
  readonly cwd: string;
  readonly skillName: string;
  readonly force: boolean;
}

/** Remove a skill from one target. Throws on abort. */
export function uninstallSkillFromTarget(input: UninstallInput): "removed" | "absent" {
  const base = baseFor(input.adapter, input.scope, input.cwd);
  const dest = join(base, input.skillName);
  if (!existsSync(dest)) {
    if (!input.force)
      throw new CrewError(
        "not_installed_here",
        `\`${input.skillName}\` isn't installed in \`${base}\``,
        { dest },
      );
    return "absent";
  }
  const marker = tryReadJson<Marker>(join(dest, ".crew.json"));
  if (!marker) {
    if (!input.force)
      throw new CrewError(
        "untracked_directory",
        `\`${dest}\` exists but isn't crew-managed (no .crew.json) — refusing to remove`,
        { dest },
      );
  } else if (marker.name !== input.skillName) {
    if (!input.force)
      throw new CrewError(
        "inconsistent_marker",
        `\`${dest}\` has a crew marker for \`${marker.name}\`, not \`${input.skillName}\` — investigate before forcing`,
        { dest, markerName: marker.name, incomingName: input.skillName },
      );
  }
  rmrf(dest);
  return "removed";
}
