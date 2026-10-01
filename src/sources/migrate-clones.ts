/**
 * One-time relocation of tap clones from the pre-0.11 layout (§6).
 *
 * Before, every tap row owned a clone at `taps/<tap-name>/`. Clones are
 * now keyed by repository at `repos/<repo-dir>/`, shared across tap rows
 * that point at the same URL. A user upgrading in place has the old
 * directories, so the first command that touches a tap moves them.
 *
 * The move is a rename when the destination is free, which preserves the
 * clone (and any fetched objects) without re-cloning. When two old taps
 * pointed at one repository only the first can claim the destination; the
 * rest are redundant copies of bytes now present at the shared path, so
 * they are deleted. Nothing is removed before the shared clone exists.
 *
 * Idempotent: once `taps/` holds no directory for a configured git tap,
 * every call is a no-op.
 */

import { renameSync } from "node:fs";
import { dirname } from "node:path";
import { legacyTapPath, paths } from "../core/paths.ts";
import { repoClonePath } from "../core/repo-path.ts";
import type { TapConfig } from "../core/types.ts";
import { ensureDir, isDirectory, isInside, rmrfInside } from "../util/fs.ts";
import { assertNoSymlinkEscape } from "../util/symlink-containment.ts";

/**
 * Caller holds the physical clone lock for migration and subsequent reads.
 * Move one tap's legacy clone to its shared location. Returns true when
 * a directory was relocated or reclaimed, false when there was nothing
 * to do.
 */
export function migrateTapClone(tap: TapConfig, home: string): boolean {
  if (tap.kind !== "git") return false;
  const old = legacyTapPath(tap.name, home);
  if (!isInside(paths(home).tapsDir, old)) return false;
  assertNoSymlinkEscape(home, old, "legacy tap clone");
  if (!isDirectory(old)) return false;
  const shared = repoClonePath(tap.url, home);
  assertNoSymlinkEscape(home, shared, "shared tap clone");
  if (isDirectory(shared)) {
    // Another tap on this repo already claimed the shared clone; this
    // copy is redundant.
    rmrfInside(paths(home).tapsDir, old);
    return true;
  }
  // Both paths live under the crew home, so this is always a
  // same-filesystem rename.
  ensureDir(dirname(shared));
  renameSync(old, shared);
  return true;
}
