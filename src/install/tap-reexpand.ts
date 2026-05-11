/**
 * Tap re-expansion for `crew update` (§10.1.1).
 *
 * For every git-kind tap with at least one state entry attributed to it
 * (filtered by `restrictNames`), walk the tap one level deep and:
 *
 *   1. ADDITIONS — children present upstream but not in state: install
 *      via the caller-provided `installNewChild` callback.
 *   2. SOURCE_GONE — entries in state attributed to this tap whose
 *      directory is no longer present upstream: report; preserve local
 *      install.
 *
 * Existing-and-still-present children are handled by the regular
 * per-skill update loop in `update-one.ts`.
 *
 * Path-kind taps follow the same algorithm; they just don't fetch and
 * their `resolvedSha` is null.
 */

import type { CrewError } from "../core/errors.ts";
import type { Config, Scope, StateEntry, StateFile, TapConfig } from "../core/types.ts";
import { hasSkillMd, loadSkill } from "../skill/load.ts";
import { acquireTap } from "../sources/acquire/index.ts";
import { isDirectory } from "../util/fs.ts";
import { indexTap } from "./tap-index.ts";

/** One re-expansion outcome row. */
export interface TapReexpandRow {
  readonly name: string;
  readonly scope: Scope;
  readonly kind: "added" | "source_gone" | "tap_error";
  readonly tap: string;
  readonly error?: { readonly code: string; readonly message: string };
}

/** Callback to install one newly-detected child skill. */
export type InstallNewChild = (args: {
  readonly skillDir: string;
  readonly skillName: string;
  readonly tapRelativePath: string;
  readonly scope: Scope;
  readonly tap: TapConfig;
  readonly agents: readonly string[];
  readonly resolvedSha: string | null;
  readonly projectRoot: string | null;
}) => StateEntry | null;

export interface TapReexpandResult {
  readonly added: readonly StateEntry[];
  readonly sourceGone: ReadonlySet<string>;
  readonly rows: readonly TapReexpandRow[];
}

interface CurrentTapChild {
  readonly name: string;
  readonly path: string;
  readonly tapRelativePath: string;
}

export function reexpandTaps(
  state: StateFile,
  config: Config,
  home: string,
  restrictNames: readonly string[],
  installOne: InstallNewChild,
): TapReexpandResult {
  const added: StateEntry[] = [];
  const sourceGone = new Set<string>();
  const rows: TapReexpandRow[] = [];

  // Group state entries by (tap-name, scope, project_root). Entries
  // sharing all three are managed together: same tap clone, same
  // install location, same target set (typically).
  const byKey = new Map<string, StateEntry[]>();
  for (const entry of state.installations) {
    const key = `${entry.source.tap}::${entry.scope}::${entry.project_root ?? ""}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(entry);
  }

  for (const members of byKey.values()) {
    const first = members[0]!;
    const tap = config.taps.find((t) => t.name === first.source.tap);
    if (!tap) {
      // Tap was removed from config but state still references it.
      // doctor --repair will rebuild it from markers; here we just skip.
      continue;
    }

    // Whole-tap tracking: only groups whose members asked for the
    // whole tap (either by URL or by tap name) get re-expanded. A
    // user who installed an individual skill from the tap doesn't
    // suddenly acquire every sibling on update.
    const tracksTap = members.some((m) => m.tracks_tap === true);
    if (!tracksTap) continue;

    // Restrict by name filter — re-expand only if the user named a
    // member of this group, or named the tap itself.
    if (restrictNames.length > 0) {
      const memberNames = new Set(members.map((m) => m.name));
      const touchesMember = restrictNames.some((n) => memberNames.has(n));
      const tapNamed = restrictNames.includes(tap.name);
      if (!(touchesMember || tapNamed)) continue;
    }

    // Project-scoped group whose project_root is gone: skip.
    const projectRoot = first.project_root ?? null;
    if (first.scope === "project" && projectRoot && !isDirectory(projectRoot)) continue;

    let acquired: { rootDir: string; resolvedSha: string | null };
    try {
      acquired = acquireTap(tap, home);
    } catch (err) {
      const ce = err as CrewError;
      for (const m of members) {
        rows.push({
          name: m.name,
          scope: m.scope,
          tap: tap.name,
          kind: "tap_error",
          error: { code: ce.code ?? "source_unreachable", message: ce.message },
        });
      }
      continue;
    }

    const children = currentTapChildren(tap, home, acquired.rootDir);
    const childKeys = new Set(children.map(childKey));

    // SOURCE_GONE: members no longer present upstream.
    for (const m of members) {
      if (!childKeys.has(entryKey(m))) {
        sourceGone.add(m.name);
        rows.push({ name: m.name, scope: m.scope, tap: tap.name, kind: "source_gone" });
      }
    }

    // ADDITIONS: children upstream not in state.
    const memberNames = new Set(members.map((m) => m.name));
    const aggregateTargets = [...new Set(members.flatMap((m) => m.agents))];
    for (const child of children) {
      if (memberNames.has(child.name)) continue;
      const entry = installOne({
        skillDir: child.path,
        skillName: child.name,
        tapRelativePath: child.tapRelativePath,
        scope: first.scope,
        tap,
        agents: aggregateTargets,
        resolvedSha: acquired.resolvedSha,
        projectRoot,
      });
      if (entry) {
        added.push(entry);
        rows.push({ name: child.name, scope: first.scope, tap: tap.name, kind: "added" });
      }
    }
  }

  return { added, sourceGone, rows };
}

function currentTapChildren(tap: TapConfig, home: string, rootDir: string): CurrentTapChild[] {
  const children: CurrentTapChild[] = [];
  if (!isDirectory(rootDir)) return children;
  if (hasSkillMd(rootDir)) {
    pushLoaded(children, rootDir, "");
    return children;
  }
  const index = indexTap(tap, home);
  for (const locs of index.skills.values()) {
    for (const loc of locs) pushLoaded(children, loc.path, loc.tapRelativePath);
  }
  return children;
}

function pushLoaded(children: CurrentTapChild[], path: string, tapRelativePath: string): void {
  try {
    const skill = loadSkill(path);
    children.push({ name: skill.frontmatter.name, path, tapRelativePath });
  } catch {
    // Skip invalid SKILL.md; same as search/install behavior.
  }
}

function childKey(child: CurrentTapChild): string {
  return `${child.tapRelativePath}\0${child.name}`;
}

function entryKey(entry: StateEntry): string {
  return `${entry.source.path}\0${entry.name}`;
}
