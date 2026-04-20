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

import { join } from "node:path";
import type { CrewError } from "../core/errors.ts";
import type { Config, Scope, StateEntry, StateFile, TapConfig } from "../core/types.ts";
import { hasSkillMd, loadSkill } from "../skill/load.ts";
import { acquireTap } from "../sources/acquire/index.ts";
import { isDirectory, listDir } from "../util/fs.ts";

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
  readonly targets: readonly string[];
  readonly resolvedSha: string | null;
  readonly projectRoot: string | null;
}) => StateEntry | null;

export interface TapReexpandResult {
  readonly added: readonly StateEntry[];
  readonly sourceGone: ReadonlySet<string>;
  readonly rows: readonly TapReexpandRow[];
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

    // Walk tap root: either it IS a single skill (root SKILL.md) or
    // it contains skill subdirectories.
    const childNames = new Set<string>();
    const childByName = new Map<string, string>(); // name → dir
    if (isDirectory(acquired.rootDir)) {
      if (hasSkillMd(acquired.rootDir)) {
        // Tap root is itself a skill: the tap holds exactly one.
        // Its `tapRelativePath` is "".
        try {
          const skill = loadSkill(acquired.rootDir);
          childNames.add(skill.frontmatter.name);
          childByName.set(skill.frontmatter.name, acquired.rootDir);
        } catch {
          // Skip; treated as if the skill disappeared.
        }
      } else {
        for (const entryName of listDir(acquired.rootDir)) {
          const dir = join(acquired.rootDir, entryName);
          if (!(isDirectory(dir) && hasSkillMd(dir))) continue;
          try {
            const skill = loadSkill(dir);
            childNames.add(skill.frontmatter.name);
            childByName.set(skill.frontmatter.name, dir);
          } catch {
            // Skip invalid SKILL.md; same as search/install behavior.
          }
        }
      }
    }

    // SOURCE_GONE: members no longer present upstream.
    for (const m of members) {
      if (!childNames.has(m.name)) {
        sourceGone.add(m.name);
        rows.push({ name: m.name, scope: m.scope, tap: tap.name, kind: "source_gone" });
      }
    }

    // ADDITIONS: children upstream not in state.
    const memberNames = new Set(members.map((m) => m.name));
    const aggregateTargets = [...new Set(members.flatMap((m) => m.targets))];
    for (const childName of childNames) {
      if (memberNames.has(childName)) continue;
      const skillDir = childByName.get(childName)!;
      const tapRelativePath = childName;
      const entry = installOne({
        skillDir,
        skillName: childName,
        tapRelativePath,
        scope: first.scope,
        tap,
        targets: aggregateTargets,
        resolvedSha: acquired.resolvedSha,
        projectRoot,
      });
      if (entry) {
        added.push(entry);
        rows.push({ name: childName, scope: first.scope, tap: tap.name, kind: "added" });
      }
    }
  }

  return { added, sourceGone, rows };
}
