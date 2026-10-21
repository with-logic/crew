/**
 * Target install operations (§7.3).
 *
 * These are adapter-independent and path-centric: multiple adapters
 * may resolve to the same `dest` (path sharing, §7.2), so the unit of
 * work is a group of adapters with the same resolved install path.
 * One physical copy + one marker is written per group, but the per-adapter
 * summary still reports each name as installed.
 */

import { basename, dirname, join } from "node:path";
import type { Marker } from "../../core/types.ts";
import { CREW_INSTALLED_BY } from "../../core/version.ts";
import { copyTree } from "../../util/copy.ts";
import { atomicReplace, ensureDir, exists, rmrf } from "../../util/fs.ts";
import { writeJson } from "../../util/json.ts";
import { progress } from "../../util/progress.ts";
import { safePath } from "../../util/redact.ts";
import { nowIso } from "../../util/time.ts";
import { baseFor } from "../adapter.ts";
import { checkInstall } from "./checks.ts";
import type { InstallInput, InstallOutcome } from "./types.ts";

export type { InstallInput, InstallOutcome } from "./types.ts";

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

  const checked = checkInstall(input, dest);
  if (checked.upToDate) return { kind: "up_to_date" };

  progress(
    `installing ${safePath(input.skillName)} → ${safePath(dest)} (${checked.incomingAdapters.join(", ")})`,
  );
  // Stage + atomic rename so a crash never leaves a half-copied directory.
  const staging = join(dirname(dest), `.crew-staging-${basename(dest)}-${Date.now()}`);
  if (exists(staging)) rmrf(staging);
  copyTree(input.storePath, staging, { stripRootMarker: true });

  const marker: Marker = {
    schema_version: 1,
    name: input.skillName,
    agents: checked.agents,
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
