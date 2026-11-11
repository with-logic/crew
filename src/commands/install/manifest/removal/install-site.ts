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
 *   4. It must be a different directory on disk from every agent's
 *      user-scope install of that skill, judged by device and inode. A project rooted
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

import { lstatSync, realpathSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { baseFor } from "../../../../agents/adapter.ts";
import { ALL_AGENTS, agentByName } from "../../../../agents/registry.ts";
import type { StateEntry } from "../../../../core/types.ts";
import { isOutside } from "../../../../manifest/index.ts";
import { NAME_PATTERN } from "../../../../refs/parse.ts";
import { hasUsableProjectRoot } from "../../../../state/validation.ts";

/** A project-scope entry of `state.json`: its `project_root` is present. */
export type ProjectStateEntry = StateEntry & {
  readonly scope: "project";
  readonly project_root: string;
};

/**
 * True when every install directory for `entry` passes the checks above. A directory that does not exist has nothing in it to protect.
 */
export function areProjectInstallPathsSafeToRemove(entry: ProjectStateEntry): boolean {
  if (!NAME_PATTERN.test(entry.name) || entry.agents.length === 0) return false;
  // §11.1: a root that is not a usable absolute path authorizes nothing.
  if (!hasUsableProjectRoot(entry)) return false;
  const root = entry.project_root;
  const physicalRoot = realpathSync(root);
  for (const agentName of entry.agents) {
    const adapter = agentByName(agentName);
    const projectBase = adapter ? baseFor(adapter, "project", root) : "";
    if (!adapter || projectBase === "") return false;
    const dir = join(projectBase, entry.name);
    const presence = probe(dir);
    if (presence === "absent") continue;
    if (presence === "unknown") return false;
    const expectedPhysicalDir = join(physicalRoot, relative(root, dir));
    if (isOutside(root, dir) || realpathSync(dir) !== expectedPhysicalDir) {
      return false;
    }
    if (isSomeUserScopeInstall(dir, entry.name, root)) return false;
  }
  return true;
}

/**
 * Whether something is at `path`. Only a path that verifiably does not
 * exist is "absent"; one that cannot be inspected is "unknown", so a
 * permission error is never mistaken for an empty spot.
 */
function probe(path: string): "present" | "absent" | "unknown" {
  try {
    lstatSync(path);
    return "present";
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "ENOENT" ? "absent" : "unknown";
  }
}

/**
 * True when `dir` is the same directory on disk as any agent's user-scope
 * install of `skillName` — not only the agent the entry records, since
 * several agents share one user-scope skills directory (§7.2).
 */
function isSomeUserScopeInstall(dir: string, skillName: string, root: string): boolean {
  return ALL_AGENTS.some((agent) =>
    isSameDirectory(dir, join(baseFor(agent, "user", root), skillName)),
  );
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
