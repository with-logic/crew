/**
 * The repository a git source's discovered folders must stay in (§9 step
 * 5 "Folder links", step 6; C-SPEC-17).
 *
 * Discovery reaches a skill's folder through the folders above it —
 * `skills/`, a namespace — and a repository may commit any of them, or
 * the skill's folder itself, as a link. One that stays inside the
 * repository is followed, as `crew update` follows an installed skill's
 * (`resolveInside`). One that leads out of it, or to its root or into its
 * `.git` (crew's clone metadata, not the source), is refused before any
 * file in it is read: staging copies a folder through its link, so it
 * would otherwise copy whatever the link points at. A path source is the
 * user's own directory and isn't held to this, as at update.
 */

import { lstatSync, readlinkSync, realpathSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { CrewError } from "../core/errors.ts";
import { paths } from "../core/paths.ts";
import { tapClonePath } from "../core/repo-path.ts";
import type { TapConfig } from "../core/types.ts";
import { climbsOut } from "../util/relative-path.ts";

/**
 * A git source's repository: where crew found it, and where it really
 * is. Null where there is no folder to check: a path source, which isn't
 * held to it, or a gist's files, which hold no folders.
 */
export type SourceBoundary = { readonly root: string; readonly real: string } | null;

/** The boundary of the repository checked out at `root`. */
export function repositoryBoundary(root: string): SourceBoundary {
  return { root: resolve(root), real: realpathSync(root) };
}

/**
 * The boundary of `at`, a location read from `tap`: the scratch export of
 * a commit holding it (§9 step 3), or else the tap's clone.
 */
export function sourceBoundary(
  tap: Pick<TapConfig, "kind" | "url" | "path">,
  home: string,
  at: string,
): SourceBoundary {
  if (tap.kind === "path") return null;
  const exports = paths(home).gitCacheDir;
  const inExports = relative(exports, at);
  if (climbsOut(inExports)) return repositoryBoundary(tapClonePath(tap, home));
  return repositoryBoundary(join(exports, inExports.split(sep)[0]!));
}

/**
 * True when `folder` — a folder discovery found, below the repository's
 * root or the root itself — leads out of `boundary`, or to the root or
 * into its `.git` through a link.
 */
export function leadsOutOfSource(boundary: SourceBoundary, folder: string): boolean {
  if (boundary === null || resolve(folder) === boundary.root) return false;
  const rel = relative(boundary.real, realFolder(folder));
  // `.git` in any case: on a case-insensitive disk `.GIT` is the same folder.
  return climbsOut(rel) || rel === "" || rel.split(sep)[0]?.toLowerCase() === ".git";
}

/**
 * Where `folder` really is: its real parent, then — while it is a link —
 * where its text leads. Discovery has just seen that it is a folder, so
 * every folder above it can be searched and resolves; the folder itself
 * is never resolved whole, so one crew can't search is found the same way
 * on every platform (Bun's `realpathSync` refuses one on some).
 */
function realFolder(folder: string): string {
  const at = join(realpathSync(dirname(folder)), basename(folder));
  return lstatSync(at).isSymbolicLink() ? realFolder(resolve(dirname(at), readlinkSync(at))) : at;
}

/**
 * `invalid_skill` for a folder discovery won't read: it leads out of the
 * repository. The message names it as `shown` — its location in the
 * repository, where the caller knows it — and `details.path` as it is.
 */
export function outOfSourceError(folder: string, shown = folder): CrewError {
  return new CrewError(
    "invalid_skill",
    `\`${shown}\` leads out of the repository through a link — or to its root or \`.git\` — so crew won't read it`,
    { path: folder },
    "Make it a folder in the repository, or a link to a folder inside it.",
  );
}
