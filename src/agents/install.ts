/**
 * Target install operations (§7.3).
 *
 * These are adapter-independent and path-centric: multiple adapters
 * may resolve to the same `dest` (path sharing, §7.2), so the unit of
 * work is a group of adapters with the same resolved install path.
 * One physical copy + one marker is written per group, but the per-adapter
 * summary still reports each name as installed.
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
import { type AgentAdapter, baseFor } from "./adapter.ts";

/** Input to the install operation for one (dest, agent-group). */
export interface InstallInput {
  /** The agents that share this `dest`. Always non-empty. */
  readonly agents: readonly AgentAdapter[];
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

/** Outcome of one physical install (one `dest`). */
export type InstallOutcome = { kind: "installed" } | { kind: "up_to_date" };

/**
 * Install a staged skill into one physical `dest`, performing all
 * safety checks. All adapters in `input.agents` end up as owners of
 * the resulting marker. Throws `CrewError` on abort (unless --force
 * overrides the check).
 */
export function installSkillIntoAgents(input: InstallInput): InstallOutcome {
  // Every adapter in the group must resolve to the same `dest` —
  // grouping happens before we get here. Use the first adapter's
  // `base` and carry all adapter names in the marker.
  const base = baseFor(input.agents[0]!, input.scope, input.cwd);
  ensureDir(base, 0o755);
  const dest = join(base, input.skillName);

  const incomingAdapters = [...new Set(input.agents.map((a) => a.name))].sort();
  let priorAdapters: readonly string[] = [];

  if (existsSync(dest)) {
    const existingMarker = tryReadJson<Marker>(join(dest, ".crew.json"));
    if (existingMarker) {
      priorAdapters = existingMarker.agents ?? [];
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
        // Same hash, same name, same resolved SHA, same owners → up-to-date, no-op.
        const mergedAdapters = mergeAdapters(priorAdapters, incomingAdapters);
        const sameAdapters =
          mergedAdapters.length === priorAdapters.length &&
          mergedAdapters.every((a, i) => a === priorAdapters[i]);
        if (
          existingMarker.resolved_sha === input.resolvedSha &&
          existingMarker.content_hash === input.contentHash &&
          sameAdapters &&
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

  const agents = mergeAdapters(priorAdapters, incomingAdapters);
  const marker: Marker = {
    schema_version: 1,
    name: input.skillName,
    agents,
    tap_name: input.tap.name,
    tap_kind: input.tap.kind,
    tap_url: input.tap.url,
    tap_subpath: input.tap.subpath,
    tap_path: input.tap.path,
    ...(input.tap.discovery === "recursive" ? { tap_discovery: "recursive" } : {}),
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

/** Union of two adapter-name lists, sorted and deduplicated. */
function mergeAdapters(a: readonly string[], b: readonly string[]): string[] {
  return [...new Set([...a, ...b])].sort();
}
