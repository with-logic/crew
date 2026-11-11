/**
 * Whether a project install directory is the project's alone (§9.2).
 *
 * A project's skills directory can be a symbolic link: to the user-scope
 * directory, to another project's, to one recorded under another crew
 * home. Removing "this project's" copy of a skill there would delete a
 * skill some other install location still has. Rather than try to learn
 * who else uses the directory, removal asks a question it can answer from
 * the filesystem alone: is the directory reached from the project root
 * without crossing a symbolic link?
 */

import { existsSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { baseFor } from "../../../../agents/adapter.ts";
import { agentByName } from "../../../../agents/registry.ts";
import type { StateEntry } from "../../../../core/types.ts";

/** A project-scope entry: its `project_root` is known to be present. */
export type ProjectEntry = StateEntry & {
  readonly scope: "project";
  readonly project_root: string;
};

/**
 * True when every directory `entry` is installed into lies physically
 * inside its project root, at the same relative path it has by name.
 * A directory that does not exist has nothing in it to protect.
 */
export function isExclusivelyInProject(entry: ProjectEntry): boolean {
  const root = entry.project_root;
  const physicalRoot = realpathSync(root);
  for (const name of entry.agents) {
    const adapter = agentByName(name);
    if (!adapter) continue;
    const dir = join(baseFor(adapter, "project", root), entry.name);
    if (!existsSync(dir)) continue;
    if (realpathSync(dir) !== join(physicalRoot, relative(root, dir))) return false;
  }
  return true;
}
