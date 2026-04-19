/**
 * Bundle re-expansion for `crew update` (§10.1.1).
 *
 * A bundle is the expansion record produced when `crew install` walks a
 * multi-skill source one level deep. Each resulting state entry carries
 * a `bundle: { ref, source }` pointing back at the user's original
 * reference. On every update run, for each distinct bundle present in
 * state at the current update scope, we:
 *
 *   1. Re-parse `bundle.ref` and acquire the source. A failure here is
 *      reported per-member but does NOT touch local installs.
 *   2. Walk one level deep to build the current child set.
 *   3. For each NEW child (in the resolved set but not in state): the
 *      caller installs it fresh via the provided callback and the new
 *      state entry is collected.
 *   4. For each MISSING child (in state with this bundle but not in the
 *      resolved set): return `source_gone` so the caller can surface it.
 *
 * Children still present are handled by the regular per-skill update
 * logic — this module only reconciles additions and removals.
 */

import { existsSync } from "node:fs";
import type { CrewError } from "../core/errors.ts";
import type { BundleRef, Config, Scope, StateEntry, StateFile } from "../core/types.ts";
import { parseRef } from "../refs/parse.ts";
import { acquireSource } from "../sources/acquire.ts";
import { expandSkills } from "../sources/expand.ts";

/** One bundle re-expansion outcome, one row per child affected. */
export interface BundleRow {
  readonly name: string;
  readonly scope: Scope;
  readonly kind: "added" | "source_gone" | "bundle_error";
  readonly error?: { code: string; message: string };
}

/** Callback the caller provides to actually install a newly-detected child. */
export type InstallNewChild = (args: {
  readonly skillDir: string;
  readonly skillName: string;
  readonly scope: Scope;
  readonly bundle: BundleRef;
  readonly targets: readonly string[];
  readonly resolvedSha: string | null;
  readonly requestedRef: string | null;
  readonly pinned: boolean;
  /**
   * Where to install if the bundle is project-scoped. For user-scope
   * bundles this is ignored. Derived from the first member's
   * `project_root` — every member of a bundle shares one by invariant.
   */
  readonly projectRoot: string | null;
}) => StateEntry | null;

/** Result of re-expanding every bundle in state. */
export interface BundleReexpandResult {
  readonly added: readonly StateEntry[];
  readonly sourceGone: ReadonlySet<string>;
  readonly rows: readonly BundleRow[];
}

/**
 * For every distinct bundle in `state`, re-resolve and produce extra
 * install entries + source_gone reports. This function is side-effect-y
 * only through `installOne`; it does not write state itself.
 */
export function reexpandBundles(
  state: StateFile,
  config: Config,
  home: string,
  restrictNames: readonly string[],
  installOne: InstallNewChild,
): BundleReexpandResult {
  const added: StateEntry[] = [];
  const sourceGone = new Set<string>();
  const rows: BundleRow[] = [];

  const byKey = new Map<string, StateEntry[]>();
  for (const entry of state.installations) {
    if (!entry.bundle) continue;
    const key = `${entry.scope}::${entry.bundle.ref}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(entry);
  }

  for (const members of byKey.values()) {
    // `restrictNames` (from `crew update <name>...`): only re-expand
    // bundles that cover a targeted name or whose ref itself was passed.
    if (restrictNames.length > 0) {
      const memberNames = new Set(members.map((m) => m.name));
      const touchesMember = restrictNames.some((n) => memberNames.has(n));
      const refPassed = restrictNames.includes(members[0]!.bundle!.ref);
      if (!(touchesMember || refPassed)) continue;
    }

    // Project-scoped bundle whose `project_root` is gone: don't install
    // any new children. `updateCommand` will flag each existing member
    // as `missing_project_root` when it walks the per-skill update loop.
    const projectRoot = members[0]!.project_root ?? null;
    if (members[0]!.scope === "project" && projectRoot && !existsSync(projectRoot)) continue;

    const acquired = tryAcquireBundle(members, config, home, rows);
    if (!acquired) continue;

    const currentNames = new Set(acquired.children.map((c) => c.name));
    for (const m of members) {
      if (!currentNames.has(m.name)) {
        sourceGone.add(m.name);
        rows.push({ name: m.name, scope: m.scope, kind: "source_gone" });
      }
    }

    const memberNames = new Set(members.map((m) => m.name));
    for (const child of acquired.children) {
      if (memberNames.has(child.name)) continue;
      const entry = installOne({
        skillDir: child.path,
        skillName: child.name,
        scope: members[0]!.scope,
        bundle: members[0]!.bundle!,
        targets: [...new Set(members.flatMap((m) => m.targets))],
        resolvedSha: acquired.resolvedSha,
        requestedRef: acquired.requestedRef,
        pinned: acquired.pinned,
        projectRoot: members[0]!.project_root ?? null,
      });
      if (entry) {
        added.push(entry);
        rows.push({ name: child.name, scope: members[0]!.scope, kind: "added" });
      }
    }
  }

  return { added, sourceGone, rows };
}

interface AcquiredBundle {
  readonly children: readonly { name: string; path: string }[];
  readonly resolvedSha: string | null;
  readonly requestedRef: string | null;
  readonly pinned: boolean;
}

function tryAcquireBundle(
  members: readonly StateEntry[],
  config: Config,
  home: string,
  rows: BundleRow[],
): AcquiredBundle | null {
  try {
    const source = parseRef(members[0]!.bundle!.ref);
    const acquired = acquireSource(source, config, home);
    const loadedList = expandSkills(acquired.rootDir);
    return {
      children: loadedList.map((l) => ({ name: l.frontmatter.name, path: l.path })),
      resolvedSha: acquired.resolvedSha,
      requestedRef: acquired.requestedRef,
      pinned: acquired.pinned,
    };
  } catch (err) {
    const ce = err as CrewError;
    for (const m of members) {
      rows.push({
        name: m.name,
        scope: m.scope,
        kind: "bundle_error",
        error: { code: ce.code ?? "usage_error", message: ce.message },
      });
    }
    return null;
  }
}
