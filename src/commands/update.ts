/**
 * `crew update [<name>...]` (§10.1).
 *
 * For each installed skill (or the named subset), re-resolve the ref to
 * a SHA. If the SHA hasn't moved, report up-to-date. If it has and the
 * ref is not pinned (or `--force`), re-stage into the store and re-run
 * the install algorithm against every currently-installed (target,
 * scope) pair.
 *
 * Bundle re-expansion (§10.1.1) runs first: for every distinct bundle
 * in state, re-resolve the original reference, install newly-added
 * children, and mark removed children as `source_gone`. This is how
 * `crew install @org/skills` + autoupdate pulls in new team skills.
 *
 * Error isolation: a failure on one skill is recorded against that
 * skill only; processing continues. Exit code follows §10.1:
 *   - 0 if every skill is up-to-date / updated / cleanly-skipped / source_gone.
 *   - 1 if any skill had a hard failure (network, fetch, validation).
 */

import { existsSync } from "node:fs";
import { readConfig } from "../config/load.ts";
import { CrewError } from "../core/errors.ts";
import { crewHome, tapPath } from "../core/paths.ts";
import type { BundleRef, Config, Scope, StateEntry, StateFile } from "../core/types.ts";
import { ensureRepo } from "../git/repo.ts";
import { type BundleRow, reexpandBundles } from "../install/bundle-update.ts";
import { garbageCollectStore } from "../maintenance/gc.ts";
import { acquireSource } from "../sources/acquire.ts";
import { expandSkills } from "../sources/expand.ts";
import { stageIntoStore } from "../sources/store.ts";
import { readState, upsertEntry, writeState } from "../state/load.ts";
import { withStateLock } from "../state/lock.ts";
import { cwdForEntry } from "../targets/adapter.ts";
import { installSkillIntoTarget } from "../targets/install.ts";
import { adapterByName } from "../targets/registry.ts";
import { nowIso } from "../util/time.ts";
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
  | { kind: "source_gone" }
  | { kind: "missing_project_root"; root: string }
  | { kind: "failed"; error: { code: string; message: string } };

interface Row {
  name: string;
  scope: string;
  outcome: Outcome;
}

/** Result of refreshing one configured tap at the start of an update run. */
interface TapRow {
  name: string;
  url: string;
  kind: "refreshed" | "failed";
  error?: { code: string; message: string };
}

export function updateCommand(ctx: CommandContext): CommandOutput {
  const config = readConfig(ctx.home);
  const home = ctx.home ?? crewHome();

  const names = ctx.positional;

  const rows: Row[] = [];
  const bundleRows: BundleRow[] = [];
  const tapRows: TapRow[] = [];
  let hardFailure = false;

  const newState = withStateLock(() => {
    let current = readState(home);

    // §10.1 step 1: fetch every configured tap so local clones reflect
    // upstream. Per-tap failures become warnings, not hard errors — an
    // offline tap doesn't stop updates for the rest. This is what keeps
    // `crew search` in sync with upstream without requiring a reinstall.
    for (const tap of config.taps) {
      try {
        ensureRepo(tap.url, tapPath(tap.name, home));
        tapRows.push({ name: tap.name, url: tap.url, kind: "refreshed" });
      } catch (err) {
        const ce = err as CrewError;
        tapRows.push({
          name: tap.name,
          url: tap.url,
          kind: "failed",
          error: { code: ce.code ?? "source_unreachable", message: ce.message },
        });
      }
    }

    // §10.1 step 2b: re-expand bundles before walking per-skill updates.
    const reexpanded = reexpandBundles(current, config, home, names, (args) =>
      installNewBundleChild(args, ctx.flags.force, home, ctx.cwd),
    );
    bundleRows.push(...reexpanded.rows);
    for (const entry of reexpanded.added) {
      current = upsertEntry(current, entry);
    }
    const sourceGone = reexpanded.sourceGone;

    const targetEntries = chooseEntries(current, names);
    for (const entry of targetEntries) {
      if (sourceGone.has(entry.name)) {
        rows.push({ name: entry.name, scope: entry.scope, outcome: { kind: "source_gone" } });
        continue;
      }
      const { row, updatedState, bumpHardFailure } = updateOneEntry(
        entry,
        current,
        config,
        home,
        ctx.flags.force,
        ctx.cwd,
      );
      current = updatedState;
      rows.push(row);
      if (bumpHardFailure) hardFailure = true;
    }
    writeState(current, home);
    return current;
  }, home);

  // Post-state garbage collection.
  garbageCollectStore(newState, home);

  const human = rows.map(formatRow);
  for (const br of bundleRows) {
    if (br.kind === "added") human.unshift(`${br.name} [${br.scope}]: added (bundle re-expansion)`);
    else if (br.kind === "bundle_error")
      human.unshift(`${br.name} [${br.scope}]: bundle error (${br.error?.code ?? "unknown"})`);
    // `source_gone` bundle rows are reflected in the per-entry row loop.
  }
  // Tap fetch warnings go at the very top so users see them before the
  // per-skill rows. A refreshed tap is a silent success — we only
  // surface failures to keep the normal-case output tight.
  for (const tr of tapRows) {
    if (tr.kind === "failed") {
      human.unshift(
        `warning: couldn't refresh tap \`${tr.name}\` (${tr.error?.code ?? "unknown"}) — using the last-fetched clone`,
      );
    }
  }

  return {
    exitCode: hardFailure ? 1 : 0,
    human,
    json: { rows, bundle_rows: bundleRows, tap_rows: tapRows },
  };
}

function formatRow(r: Row): string {
  if (r.outcome.kind === "up_to_date") return `${r.name} [${r.scope}]: up-to-date`;
  if (r.outcome.kind === "updated")
    return `${r.name} [${r.scope}]: updated → ${r.outcome.new_sha.slice(0, 8)}`;
  if (r.outcome.kind === "skipped") return `${r.name} [${r.scope}]: skipped (${r.outcome.reason})`;
  if (r.outcome.kind === "source_gone")
    return `${r.name} [${r.scope}]: source_gone (local install preserved)`;
  if (r.outcome.kind === "missing_project_root")
    return `${r.name} [${r.scope}]: skipped — project directory \`${r.outcome.root}\` no longer exists`;
  return `${r.name} [${r.scope}]: FAILED ${r.outcome.error.code}`;
}

function chooseEntries(state: StateFile, names: readonly string[]): StateEntry[] {
  if (names.length === 0) return [...state.installations];
  const selected: StateEntry[] = [];
  for (const name of names) {
    const matches = state.installations.filter((e) => e.name === name);
    if (matches.length === 0)
      throw new CrewError(
        "unknown_skill",
        `\`${name}\` isn't installed — run \`crew list\` to see what crew is tracking`,
        { name },
      );
    selected.push(...matches);
  }
  return selected;
}

/** Per-entry update: returns a row, the new state, and whether to bump hardFailure. */
function updateOneEntry(
  entry: StateEntry,
  state: StateFile,
  config: Config,
  home: string,
  force: boolean,
  fallbackCwd: string,
): { row: Row; updatedState: StateFile; bumpHardFailure: boolean } {
  try {
    const outcome = updateOne(entry, config, home, force, fallbackCwd);
    let next = state;
    if (outcome.kind === "updated") {
      const successfulTargets = outcome.per_target
        .filter((t) => t.kind !== "failed")
        .map((t) => t.target);
      const newEntry = rebuildStateEntry(entry, outcome.new_sha, successfulTargets);
      next = upsertEntry(state, newEntry);
    }
    return {
      row: { name: entry.name, scope: entry.scope, outcome },
      updatedState: next,
      bumpHardFailure:
        outcome.kind === "updated" && outcome.per_target.some((t) => t.kind === "failed"),
    };
  } catch (err) {
    const ce = err as CrewError;
    // §10.1 upstream-deletion rule: "source resolved but skill no
    // longer exists upstream" is a soft outcome. `acquireSource`
    // surfaces this case as `no_skills_found` (git subpath missing) or
    // `invalid_ref` (tap's named skill dir absent).
    const soft = ce.code === "no_skills_found" || ce.code === "invalid_ref";
    if (soft) {
      return {
        row: { name: entry.name, scope: entry.scope, outcome: { kind: "source_gone" } },
        updatedState: state,
        bumpHardFailure: false,
      };
    }
    const hard = ["source_unreachable", "ref_not_found", "invalid_skill"].includes(ce.code);
    return {
      row: {
        name: entry.name,
        scope: entry.scope,
        outcome: {
          kind: "failed",
          error: { code: ce.code ?? "usage_error", message: ce.message },
        },
      },
      updatedState: state,
      bumpHardFailure: hard,
    };
  }
}

function updateOne(
  entry: StateEntry,
  config: Config,
  home: string,
  force: boolean,
  fallbackCwd: string,
): Outcome {
  // C-UPD-22: a project-scope entry whose recorded directory no longer
  // exists is skipped as `missing_project_root` — we preserve the
  // install and refuse to write anywhere else.
  const entryCwd = cwdForEntry(entry, fallbackCwd);
  if (entry.scope === "project" && entry.project_root && !existsSync(entry.project_root)) {
    return { kind: "missing_project_root", root: entry.project_root };
  }

  if (entry.pinned && entry.ref !== null && /^[0-9a-f]{40}$/i.test(entry.ref) && !force) {
    return { kind: "skipped", reason: "pinned to exact SHA" };
  }

  const source = reconstructSource(entry);
  const acquired = acquireSource(source, config, home);
  const newSha = acquired.resolvedSha;

  if (entry.pinned && !force && newSha !== null && newSha !== entry.resolved_sha) {
    return { kind: "skipped", reason: "pinned to tag; upstream moved" };
  }

  if (newSha === entry.resolved_sha) {
    if (newSha !== null) return { kind: "up_to_date" };
    const tentative = stageIntoStore(acquired.rootDir, entry.name, null, home);
    if (tentative.contentHash === entry.content_hash) return { kind: "up_to_date" };
  }

  const skills = expandSkills(acquired.rootDir);
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
        cwd: entryCwd,
        storePath: staged.storePath,
        skillName: entry.name,
        markerSource: entry.source,
        ref: entry.ref,
        resolvedSha: newSha,
        contentHash: staged.contentHash,
        force,
      });
      perTarget.push({
        target: targetName,
        kind: res.kind === "installed" ? "installed" : "up_to_date",
      });
    } catch (err) {
      const ce = err as CrewError;
      perTarget.push({ target: targetName, kind: "skipped", reason: ce.code });
    }
  }
  return { kind: "updated", new_sha: newSha ?? entry.resolved_sha ?? "", per_target: perTarget };
}

function reconstructSource(entry: StateEntry) {
  switch (entry.source.type) {
    case "tap":
      return { type: "tap", tap: entry.source.tap, name: entry.name, ref: entry.ref } as const;
    case "git":
      return {
        type: "git",
        url: entry.source.url,
        ref: entry.ref,
        subpath: entry.source.subpath,
      } as const;
    case "path":
      return { type: "path", path: entry.source.path } as const;
  }
}

function rebuildStateEntry(
  entry: StateEntry,
  newSha: string,
  successfulTargets: string[],
): StateEntry {
  return {
    ...entry,
    resolved_sha: newSha,
    targets: successfulTargets.length > 0 ? successfulTargets : entry.targets,
    installed_at: nowIso(),
  };
}

/**
 * Install a newly-detected bundle child (§10.1.1 step 3). Stages into
 * the store, runs the install algorithm for every target the bundle
 * currently targets, and returns a fresh state entry on success.
 */
function installNewBundleChild(
  args: {
    readonly skillDir: string;
    readonly skillName: string;
    readonly scope: Scope;
    readonly bundle: BundleRef;
    readonly targets: readonly string[];
    readonly resolvedSha: string | null;
    readonly requestedRef: string | null;
    readonly pinned: boolean;
    readonly projectRoot: string | null;
  },
  force: boolean,
  home: string,
  fallbackCwd: string,
): StateEntry | null {
  // For project-scoped bundles, new children install at the same
  // `project_root` as their siblings. User-scoped bundles don't care
  // about cwd, so the fallback is fine there.
  const childCwd = args.scope === "project" ? (args.projectRoot ?? fallbackCwd) : fallbackCwd;
  const staged = stageIntoStore(args.skillDir, args.skillName, args.resolvedSha, home);
  const successfulTargets: string[] = [];
  for (const targetName of args.targets) {
    const adapter = adapterByName(targetName);
    if (!adapter) continue;
    try {
      installSkillIntoTarget({
        adapter,
        scope: args.scope,
        cwd: childCwd,
        storePath: staged.storePath,
        skillName: args.skillName,
        markerSource: markerSourceForBundleChild(args.bundle, args.skillName),
        ref: args.requestedRef,
        resolvedSha: args.resolvedSha,
        contentHash: staged.contentHash,
        force,
      });
      successfulTargets.push(targetName);
    } catch {
      // Per-target failure is non-fatal; the child just isn't installed
      // there. The bundle row already noted it as added.
    }
  }
  if (successfulTargets.length === 0) return null;
  return {
    name: args.skillName,
    source: markerSourceForBundleChild(args.bundle, args.skillName),
    ref: args.requestedRef,
    resolved_sha: args.resolvedSha,
    content_hash: staged.contentHash,
    scope: args.scope,
    installed_at: nowIso(),
    targets: successfulTargets,
    pinned: args.pinned,
    explicit: true,
    required_by: [],
    bundle: args.bundle,
    ...(args.scope === "project" && args.projectRoot ? { project_root: args.projectRoot } : {}),
  };
}

/**
 * Derive the marker source for a freshly-installed bundle child.
 * `bundle.source` records the container; a child lives one level deeper.
 * `BundleRef.source` excludes `path` by construction (§11.1) — local
 * directories are never bundles — so only `tap` and `git` are handled.
 */
function markerSourceForBundleChild(bundle: BundleRef, childName: string): StateEntry["source"] {
  if (bundle.source.type === "tap") {
    return { type: "tap", tap: bundle.source.tap, path: `${bundle.source.path}/${childName}` };
  }
  const sub = bundle.source.subpath;
  return {
    type: "git",
    url: bundle.source.url,
    subpath: sub.length > 0 ? `${sub}/${childName}` : childName,
  };
}
