/**
 * Whether a dropped entry's install directories are safe to delete (§9.2).
 *
 * Removal deletes directories, so before it does it asks questions it can
 * answer from the filesystem and the entry alone, without having to learn
 * who else might use a directory. Anything unexpected means "not safe":
 *
 *   1. The entry's name must be a plain skill name. A name that is not one
 *      path segment could point the delete anywhere.
 *   2. The entry must record at least one agent, and every one must be an
 *      agent this build knows, with a project-scope skills directory.
 *      Otherwise there is no directory to reason about.
 *   3. Each directory must be physically inside the project root, at the
 *      same relative path it has by name. If a symbolic link is crossed on
 *      the way, the directory may be the user-scope one, another project's,
 *      or one recorded under another crew home.
 *   4. It must be a different directory on disk from the agent's user-scope
 *      install of that skill, judged by device and inode. A project rooted
 *      at the home directory shares that path with no link involved, and a
 *      bind mount shares the directory under a different path.
 *
 * `--force` overrides the uninstall safety checks (§7.4). It does not
 * override these.
 *
 * The checks describe the filesystem at the moment they run. They protect
 * against a checkout that arrives with hostile links or state; they do not
 * make deletion atomic against another process rewriting the project's
 * directories at the same instant, which no crew command that deletes by
 * path can promise.
 */

import { existsSync, realpathSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { baseFor } from "../../../../agents/adapter.ts";
import { agentByName } from "../../../../agents/registry.ts";
import type { StateEntry } from "../../../../core/types.ts";
import { isOutside } from "../../../../manifest/index.ts";
import { NAME_PATTERN } from "../../../../refs/parse.ts";

/** A project-scope entry: its `project_root` is known to be present. */
export type ProjectEntry = StateEntry & {
  readonly scope: "project";
  readonly project_root: string;
};

/**
 * True when every directory `entry` is installed into passes the checks
 * above. A directory that does not exist has nothing in it to protect.
 */
export function areProjectInstallPathsSafeToRemove(entry: ProjectEntry): boolean {
  if (!NAME_PATTERN.test(entry.name) || entry.agents.length === 0) return false;
  const root = entry.project_root;
  const physicalRoot = realpathSync(root);
  for (const agentName of entry.agents) {
    const adapter = agentByName(agentName);
    const projectBase = adapter ? baseFor(adapter, "project", root) : "";
    if (!adapter || projectBase === "") return false;
    const dir = join(projectBase, entry.name);
    if (!existsSync(dir)) continue;
    const expectedPhysicalDir = join(physicalRoot, relative(root, dir));
    if (isOutside(root, dir) || realpathSync(dir) !== expectedPhysicalDir) {
      return false;
    }
    if (isSameDirectory(dir, join(baseFor(adapter, "user", root), entry.name))) return false;
  }
  return true;
}

/**
 * True when both paths exist and are one directory on disk. Compared by
 * device and inode, not by path, so a symbolic link, a bind mount, and two
 * spellings of one path are all recognized as the same place.
 */
function isSameDirectory(a: string, b: string): boolean {
  const first = statSync(a, { throwIfNoEntry: false });
  const second = statSync(b, { throwIfNoEntry: false });
  return (
    first !== undefined &&
    second !== undefined &&
    first.dev === second.dev &&
    first.ino === second.ino
  );
}
