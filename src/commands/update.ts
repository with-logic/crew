/**
 * `crew update [<name>...]` (§10.1).
 *
 * For each installed skill (or the named subset), re-resolve the ref to
 * a SHA. If the SHA hasn't moved, report up-to-date. If it has and the
 * ref is not pinned (or `--force`), re-stage into the store and re-run
 * the install algorithm against every currently-installed (target,
 * scope) pair.
 *
 * Error isolation: a failure on one skill is recorded against that
 * skill only; processing continues. Exit code follows §10.1:
 *   - 0 if every skill is up-to-date / updated / cleanly-skipped.
 *   - 1 if any skill had a hard failure (network, fetch, validation).
 */

import { CrewError } from "../core/errors.ts";
import { readConfig } from "../config/load.ts";
import { crewHome } from "../core/paths.ts";
import type { Config, StateEntry, StateFile } from "../core/types.ts";
import { readState, upsertEntry, writeState } from "../state/load.ts";
import { withStateLock } from "../state/lock.ts";
import { acquireSource } from "../sources/acquire.ts";
import { expandSkills } from "../sources/expand.ts";
import { stageIntoStore } from "../sources/store.ts";
import { adapterByName } from "../targets/registry.ts";
import { installSkillIntoTarget } from "../targets/install.ts";
import { nowIso } from "../util/time.ts";
import { garbageCollectStore } from "../maintenance/gc.ts";
import type { CommandContext, CommandOutput } from "./types.ts";

interface PerTargetUpdate {
  target: string;
  kind: "installed" | "up_to_date" | "skipped" | "failed";
  error?: { code: string; message: string };
  reason?: string;
}

type Outcome =
  | { kind: "up_to_date" }
  | { kind: "updated"; new_sha: string; per_target: PerTargetUpdate[] }
  | { kind: "skipped"; reason: string }
  | { kind: "failed"; error: { code: string; message: string } };

interface Row {
  name: string;
  scope: string;
  outcome: Outcome;
}

export function updateCommand(ctx: CommandContext): CommandOutput {
  const config = readConfig(ctx.home);
  const home = ctx.home ?? crewHome();
  const state = readState(home);

  const names = ctx.positional;
  const scope = ctx.flags.scope; // applied only if positional supplied; update operates on all by default

  const targetEntries = chooseEntries(state, names, scope);

  const rows: Row[] = [];
  let hardFailure = false;

  const newState = withStateLock(() => {
    let current = readState(home);
    for (const entry of targetEntries) {
      try {
        const outcome = updateOne(entry, config, home, ctx.flags.force);
        if (outcome.kind === "updated") {
          // Rewrite state entry with new SHA; include every target that
          // ended either "installed", "up_to_date", or "skipped" (the
          // latter because the user's customization still "occupies" that
          // target and the state record should reflect that).
          const successfulTargets = outcome.per_target
            .filter((t) => t.kind !== "failed")
            .map((t) => t.target);
          const newEntry = rebuildStateEntry(entry, outcome.new_sha, successfulTargets);
          current = upsertEntry(current, newEntry);
          if (outcome.per_target.some((t) => t.kind === "failed")) hardFailure = true;
        }
        rows.push({ name: entry.name, scope: entry.scope, outcome });
      } catch (err) {
        const ce = err as CrewError;
        rows.push({
          name: entry.name,
          scope: entry.scope,
          outcome: { kind: "failed", error: { code: ce.code ?? "usage_error", message: ce.message } },
        });
        if (["source_unreachable", "ref_not_found", "invalid_skill"].includes(ce.code)) {
          hardFailure = true;
        }
      }
    }
    writeState(current, home);
    return current;
  }, home);

  // Post-state garbage collection.
  garbageCollectStore(newState, home);

  const human = rows.map((r) => {
    if (r.outcome.kind === "up_to_date") return `${r.name} [${r.scope}]: up-to-date`;
    if (r.outcome.kind === "updated") return `${r.name} [${r.scope}]: updated → ${r.outcome.new_sha.slice(0, 8)}`;
    if (r.outcome.kind === "skipped") return `${r.name} [${r.scope}]: skipped (${r.outcome.reason})`;
    return `${r.name} [${r.scope}]: FAILED ${r.outcome.error.code}`;
  });

  return {
    exitCode: hardFailure ? 1 : 0,
    human,
    json: { rows },
  };
}

function chooseEntries(state: StateFile, names: readonly string[], scope: StateEntry["scope"]): StateEntry[] {
  if (names.length === 0) return [...state.installations];
  const selected: StateEntry[] = [];
  for (const name of names) {
    const matches = state.installations.filter((e) => e.name === name && e.scope === scope);
    if (matches.length === 0) {
      throw new CrewError("unknown_skill", `\`${name}\` is not installed at ${scope} scope`);
    }
    selected.push(...matches);
  }
  return selected;
}

function updateOne(entry: StateEntry, config: Config, home: string, force: boolean): Outcome {
  // Pinned SHA skips unless --force.
  if (entry.pinned && entry.ref !== null && /^[0-9a-f]{40}$/i.test(entry.ref) && !force) {
    return { kind: "skipped", reason: "pinned to exact SHA" };
  }

  const source = reconstructSource(entry);
  const acquired = acquireSource(source, config, home);
  const newSha = acquired.resolvedSha;

  if (entry.pinned && !force && newSha !== null && newSha !== entry.resolved_sha) {
    // Tag moved without --force: skip.
    return { kind: "skipped", reason: "pinned to tag; upstream moved" };
  }

  // Path sources have null SHAs on both sides — treat as up-to-date only
  // if the content hash also matches (cheap short-circuit based on the
  // new acquired content).
  if (newSha === entry.resolved_sha) {
    if (newSha !== null) return { kind: "up_to_date" };
    // For path sources, compare by staged content hash.
    const tentative = stageIntoStore(acquired.rootDir, entry.name, null, home);
    if (tentative.contentHash === entry.content_hash) return { kind: "up_to_date" };
  }

  const skills = expandSkills(acquired.rootDir);
  // `acquired.rootDir` either points at a skill directly (list length 1
  // with matching name, since a directory's dir-name must equal its
  // frontmatter name per validation) or at a container; in either case
  // we want the entry that matches `entry.name`.
  const skill = skills.find((s) => s.frontmatter.name === entry.name) ?? skills[0]!;
  const staged = stageIntoStore(skill.path, entry.name, newSha, home);
  const perTarget: PerTargetUpdate[] = [];
  for (const targetName of entry.targets) {
    const adapter = adapterByName(targetName);
    if (!adapter) continue;
    try {
      const res = installSkillIntoTarget({
        adapter,
        scope: entry.scope,
        cwd: process.cwd(),
        storePath: staged.storePath,
        skillName: entry.name,
        markerSource: entry.source,
        ref: entry.ref,
        resolvedSha: newSha,
        contentHash: staged.contentHash,
        force,
      });
      perTarget.push({ target: targetName, kind: res.kind === "installed" ? "installed" : "up_to_date" });
    } catch (err) {
      // `installSkillIntoTarget` only throws safety-check errors
      // (customized / untracked_directory / inconsistent_marker), all of
      // which §10.1 treats as clean skips — the user edited the
      // destination and we don't touch it.
      const ce = err as CrewError;
      perTarget.push({ target: targetName, kind: "skipped", reason: ce.code });
    }
  }
  return { kind: "updated", new_sha: newSha ?? entry.resolved_sha ?? "", per_target: perTarget };
}

function reconstructSource(entry: StateEntry) {
  // Produce a `Source` usable by `acquireSource`. For tap entries, the
  // source is `tap/name[@ref]`; for git, the URL + ref + subpath; for
  // path, the absolute path.
  switch (entry.source.type) {
    case "tap":
      return { type: "tap", tap: entry.source.tap, name: entry.name, ref: entry.ref } as const;
    case "git":
      return { type: "git", url: entry.source.url, ref: entry.ref, subpath: entry.source.subpath } as const;
    case "path":
      return { type: "path", path: entry.source.path } as const;
  }
}

function rebuildStateEntry(entry: StateEntry, newSha: string, successfulTargets: string[]): StateEntry {
  return {
    ...entry,
    resolved_sha: newSha,
    targets: successfulTargets.length > 0 ? successfulTargets : entry.targets,
    installed_at: nowIso(),
  };
}
