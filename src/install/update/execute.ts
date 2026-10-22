/** Resolve and apply one update source while retaining acquisition defaults (§10.1, §14). */
import { existsSync } from "node:fs";
import { cwdForEntry } from "../../agents/adapter.ts";
import type { TargetBaseFailures } from "../../agents/target-lock/index.ts";
import type { Config, StateEntry, TapConfig } from "../../core/types.ts";
import { type AcquiredTap, withAcquiredSkillPath } from "../../sources/acquire/index.ts";
import type { PreparedSources } from "../../sources/acquire/revision.ts";
import { isGistTap } from "../../sources/gist.ts";
import { stageIntoStore } from "../../sources/store.ts";
import { hasUsableProjectRoot } from "../../state/validation.ts";
import { peekResolvedSha } from "./peek.ts";
import { groupRecordedTargets, reinstallIntoAgents } from "./reinstall.ts";
import { readUpdateSource } from "./source.ts";
import type { InternalOutcome } from "./types.ts";

export function updateOne(
  entry: StateEntry,
  config: Config,
  home: string,
  force: boolean,
  fallbackCwd: string,
  dryRun: boolean,
  baseFailures?: TargetBaseFailures,
  prepared?: PreparedSources,
): InternalOutcome {
  if (
    entry.scope === "project" &&
    !(hasUsableProjectRoot(entry) && existsSync(entry.project_root))
  ) {
    return { kind: "missing_project_root", root: String(entry.project_root ?? "(unknown)") };
  }

  const entryCwd = cwdForEntry(entry, fallbackCwd);
  if (entry.pinned && entry.ref !== null && /^[0-9a-f]{40}$/i.test(entry.ref) && !force) {
    return { kind: "skipped", reason: "pinned to exact SHA" };
  }

  const tap = config.taps.find((t) => t.name === entry.source.tap);
  if (!tap) {
    // Tap was removed from config (manually); doctor --repair can fix.
    return { kind: "tap_missing", tap: entry.source.tap };
  }
  // §10.1 step 3c: re-resolve the entry's own ref. An entry installed at
  // a branch follows that branch (a branch is not pinned), and a forced
  // tag update installs the tag's current commit — neither is the
  // clone's `origin/HEAD`.
  //
  // Resolution happens before materialization: an up-to-date tap needs
  // only its SHA, and exporting a large tree just to discard it is the
  // common case on a routine `crew update`.
  // `--force` reinstalls a pinned entry even at an unchanged SHA, so it
  // still needs the bytes.
  // §14: consume the prepared failure before later local clone inspection.
  const revision =
    prepared && tap.kind === "git" ? prepared.revisionFor(tap, entry.ref) : undefined;
  const peeked = revision?.resolvedSha ?? peekResolvedSha(tap, entry.ref, home);
  if (peeked !== null && peeked === entry.resolved_sha && !(force && entry.pinned)) {
    return { kind: "up_to_date" };
  }
  if (peeked !== null && entry.pinned && !force) {
    return { kind: "skipped", reason: "pinned to tag; upstream moved" };
  }
  // Only this entry's own directory or gist file is read and exported —
  // otherwise every entry sharing a whole-repo tap materializes the
  // whole repository again (§10.1).
  return withAcquiredSkillPath(
    tap,
    entry.ref,
    entry.source.path,
    home,
    (acquired, sourcePath) =>
      applyUpdate(entry, acquired, sourcePath, tap, home, force, entryCwd, dryRun, baseFailures),
    prepared,
  );
}

/** Stage and reinstall one entry from an already-acquired tree. */
function applyUpdate(
  entry: StateEntry,
  acquired: Pick<AcquiredTap, "resolvedSha" | "pinned">,
  sourcePath: string,
  tap: TapConfig,
  home: string,
  force: boolean,
  entryCwd: string,
  dryRun: boolean,
  baseFailures?: TargetBaseFailures,
): InternalOutcome {
  const newSha = acquired.resolvedSha;

  if (entry.pinned && !force && newSha !== null && newSha !== entry.resolved_sha) {
    return { kind: "skipped", reason: "pinned to tag; upstream moved" };
  }

  // §10.1: validate the source before a no-target skip so invalid metadata still fails.
  const source = readUpdateSource(entry, tap, sourcePath, newSha, force);
  if (source.kind !== "ready") return source;
  const { loaded, sourceHash } = source;
  const targetGroups = groupRecordedTargets(entry, entryCwd);
  if (targetGroups.size === 0) return { kind: "skipped", reason: "no applicable agent targets" };
  if (dryRun) return { kind: "would_update", new_sha: newSha };
  const staged = stageIntoStore(loaded.path, entry.name, newSha, home, sourceHash, isGistTap(tap));
  const perTarget = reinstallIntoAgents({
    entry,
    tap,
    storePath: staged.storePath,
    contentHash: staged.contentHash,
    newSha,
    force,
    entryCwd,
    targetGroups: targetGroups.values(),
    ...(baseFailures ? { baseFailures } : {}),
  });
  return {
    kind: "updated",
    new_sha: newSha,
    content_hash: staged.contentHash,
    per_target: perTarget,
  };
}
