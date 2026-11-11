/**
 * Whether a dropped entry's install directories are safe to delete (§9.2).
 *
 * Removal deletes directories, so before it does it asks three questions it
 * can answer from the filesystem and the entry alone, without having to
 * learn who else might use a directory:
 *
 *   1. Is the entry's name a plain skill name? A name that is not one path
 *      segment could point the delete anywhere.
 *   2. Is each directory physically inside the project root, at the same
 *      relative path it has by name? If a symbolic link is crossed on the
 *      way, the directory may be the user-scope one, another project's, or
 *      one recorded under another crew home.
 *   3. Is it a different directory from the agent's user-scope install of
 *      that skill? A project rooted at the home directory shares that path
 *      with no link involved.
 *
 * `--force` overrides the uninstall safety checks (§7.4). It does not
 * override these.
 */

import { existsSync, realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { baseFor } from "../../../../agents/adapter.ts";
import { agentByName } from "../../../../agents/registry.ts";
import type { StateEntry } from "../../../../core/types.ts";
import { NAME_PATTERN } from "../../../../refs/parse.ts";

/** A project-scope entry: its `project_root` is known to be present. */
export type ProjectEntry = StateEntry & {
  readonly scope: "project";
  readonly project_root: string;
};

/**
 * True when every directory `entry` is installed into passes the three
 * checks above. A directory that does not exist has nothing to protect.
 */
export function hasExpectedProjectInstallPaths(entry: ProjectEntry): boolean {
  if (!NAME_PATTERN.test(entry.name)) return false;
  const root = entry.project_root;
  const physicalRoot = realpathSync(root);
  for (const name of entry.agents) {
    const adapter = agentByName(name);
    if (!adapter) continue;
    const dir = join(baseFor(adapter, "project", root), entry.name);
    if (!existsSync(dir)) continue;
    const physicalDir = realpathSync(dir);
    const fromRoot = relative(root, dir);
    const isInsideRoot = fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`);
    if (!isInsideRoot || physicalDir !== join(physicalRoot, fromRoot)) return false;
    const userDir = join(baseFor(adapter, "user", root), entry.name);
    if (existsSync(userDir) && realpathSync(userDir) === physicalDir) return false;
  }
  return true;
}
