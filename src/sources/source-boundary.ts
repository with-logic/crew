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

import { lstatSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { CrewError } from "../core/errors.ts";
import { paths } from "../core/paths.ts";
import { tapClonePath } from "../core/repo-path.ts";
import type { TapConfig } from "../core/types.ts";
import { toPosix, utf8LinkText } from "../util/fs.ts";
import { climbsOut } from "../util/relative-path.ts";

/**
 * A git source's repository: where crew found it, and where it really
 * is. Null where there is no folder to check: a path source, which isn't
 * held to it, or a gist's files, which hold no folders.
 */
export type SourceBoundary = { readonly root: string; readonly real: string } | null;

/**
 * The boundary of the repository checked out at `root`, found as any
 * folder is (`realFolder`), so a root crew can't search fails where its
 * listing does — `source_unreachable` (C-SPEC-18) — not here.
 */
export function repositoryBoundary(root: string): SourceBoundary {
  return { root: resolve(root), real: realFolder(root) };
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
 * True when discovery must refuse `folder` — a folder it found, below the
 * repository's root or the root itself: it leads out of `boundary`, or to
 * the root or into its `.git`, through a link, or crew can't place it.
 */
export function isRefusedSourceFolder(boundary: SourceBoundary, folder: string): boolean {
  if (boundary === null || resolve(folder) === boundary.root) return false;
  let real: string;
  try {
    real = realFolder(folder);
  } catch {
    // A folder crew can't place as the OS does — link text that isn't
    // UTF-8, more links than any OS follows, a name too long to look up —
    // isn't known to stay inside, so it is refused as leading out.
    return true;
  }
  const rel = relative(boundary.real, real);
  // `.git` in any case: on a case-insensitive disk `.GIT` is the same folder.
  return climbsOut(rel) || rel === "" || rel.split(sep)[0]?.toLowerCase() === ".git";
}

/**
 * Where `folder` really is, found as the OS finds it: from the root, each
 * part of the way in turn, a link's text read from the folder the link
 * sits in. A `..` climbs from where the parts before it really lead —
 * never from the text, which would let `link/..` stand for the folder
 * holding `link` when `link` leads elsewhere. Every step only looks a name
 * up (`lstat`), so a folder crew can search but not list — the source's
 * root, say — is found the same way on every platform (Bun's
 * `realpathSync` refuses one on some).
 */
function realFolder(folder: string): string {
  return follow(sep, resolve(folder), { left: MAX_FOLDER_LINKS, texts: new Map() });
}

/**
 * As many links as any OS follows in one path (Linux allows 40):
 * discovery has just seen that `folder` is a folder, so the OS resolved it
 * in at most 40.
 */
const MAX_FOLDER_LINKS = 40;

/** The links one `realFolder` call may still follow, and each path's link text (null: no link). */
interface Links {
  left: number;
  readonly texts: Map<string, string | null>;
}

/** `text`, relative to real folder `dir` unless absolute, resolved part by part. */
function follow(dir: string, text: string, links: Links): string {
  let at = isAbsolute(text) ? sep : dir;
  for (const part of text.split(sep)) {
    if (part === "" || part === ".") continue;
    // `at` is real, so its parent is where `..` leads.
    if (part === "..") {
      at = dirname(at);
      continue;
    }
    const next = join(at, part);
    const linked = linkText(next, links);
    if (linked === null) {
      at = next;
      continue;
    }
    if (--links.left < 0) throw new Error(`too many links resolving \`${next}\``);
    at = follow(at, linked, links);
  }
  return at;
}

/** `path`'s link text, or null when it is no link; each path looked at once per call. */
function linkText(path: string, links: Links): string | null {
  let text = links.texts.get(path);
  if (text === undefined) {
    text = lstatSync(path).isSymbolicLink() ? followableText(path) : null;
    links.texts.set(path, text);
  }
  return text;
}

/** `path`'s link text; throws when it isn't UTF-8, as crew can't follow it as the OS does. */
function followableText(path: string): string {
  const text = utf8LinkText(path);
  if (text === null) throw new Error(`the link text of \`${path}\` isn't UTF-8`);
  return text;
}

/**
 * `invalid_skill` for a folder discovery won't read (`isRefusedSourceFolder`):
 * it leads out of `boundary`'s repository, or to its root or `.git`. The
 * message names it by its place in the repository; `details.path` holds it
 * as crew found it.
 */
export function refusedSourceFolderError(
  boundary: NonNullable<SourceBoundary>,
  folder: string,
): CrewError {
  return new CrewError(
    "invalid_skill",
    `\`${toPosix(relative(boundary.root, folder))}\` leads out of the repository through a link — or to its root or \`.git\` — so crew won't read it`,
    { path: folder },
    "Make it a folder in the repository, or a link to a folder inside it.",
  );
}
