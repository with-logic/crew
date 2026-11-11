/**
 * Detecting a project install directory that is physically someone else's
 * (§9.2).
 *
 * A project's skills directory can be a symbolic link — to the user-scope
 * directory, or to another project's. Removing "this project's" copy of a
 * skill there would delete a skill another install location still has, so
 * removal checks the physical directory first.
 */

import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { baseFor } from "../../../../agents/adapter.ts";
import { agentByName } from "../../../../agents/registry.ts";
import type { StateEntry, StateFile } from "../../../../core/types.ts";
import { entryKey } from "../../../../state/identity.ts";

/** A project-scope entry: its `project_root` is known to be present. */
export type ProjectEntry = StateEntry & {
  readonly scope: "project";
  readonly project_root: string;
};

/**
 * True when one of `entry`'s install directories is physically the same
 * directory as the user-scope install of that skill, or as the install of
 * the same skill recorded at another install location.
 */
export function sharesPhysicalTarget(entry: ProjectEntry, state: StateFile): boolean {
  const mine = physicalTargets(entry, "project", entry.project_root);
  if (mine.size === 0) return false;
  const theirs = physicalTargets(entry, "user", entry.project_root);
  for (const other of state.installations) {
    if (other.name !== entry.name || entryKey(other) === entryKey(entry)) continue;
    if (other.scope !== "project" || other.project_root === undefined) continue;
    for (const target of physicalTargets(other, "project", other.project_root)) theirs.add(target);
  }
  return [...mine].some((target) => theirs.has(target));
}

/** The real paths of the directories `entry`'s agents install it into at one location. */
function physicalTargets(
  entry: StateEntry,
  scope: "user" | "project",
  projectRoot: string,
): Set<string> {
  const targets = new Set<string>();
  for (const name of entry.agents) {
    const adapter = agentByName(name);
    if (!adapter) continue;
    const dir = join(baseFor(adapter, scope, projectRoot), entry.name);
    if (existsSync(dir)) targets.add(realpathSync(dir));
  }
  return targets;
}
