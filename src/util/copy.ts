/**
 * Directory copy with explicit rules around hidden files and symlinks.
 *
 * Crew copies a staged skill from the source (or from the store) into a
 * target location and writes a marker. Two requirements drive the shape:
 *
 *   1. `.crew.json` at the root of the source must NEVER be copied — the
 *      marker is crew-owned (§7.3 5b).
 *   2. Symlinks must be preserved as symlinks, not followed. Symlink
 *      targets outside the source aren't traversed (§12.1).
 */

import { copyFileSync, lstatSync, readdirSync, readlinkSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { ensureDir } from "./fs.ts";

/** Options for `copyTree`. */
export interface CopyTreeOptions {
  /**
   * If true, skip a `.crew.json` at the root of the source. Default: true.
   * We never accept a source-authored marker regardless of where it sits in
   * the tree we're materializing; it's always and only crew's output.
   */
  readonly stripRootMarker?: boolean;
}

/** Copy everything under `src` into `dest`, creating `dest` if needed. */
export function copyTree(src: string, dest: string, options: CopyTreeOptions = {}): void {
  const stripRootMarker = options.stripRootMarker !== false;
  copyDirInto(src, dest, "", stripRootMarker);
}

function copyDirInto(srcRoot: string, destRoot: string, rel: string, stripRootMarker: boolean): void {
  const srcDir = rel === "" ? srcRoot : join(srcRoot, rel);
  const destDir = rel === "" ? destRoot : join(destRoot, rel);
  ensureDir(destDir);
  for (const name of readdirSync(srcDir)) {
    if (stripRootMarker && rel === "" && name === ".crew.json") continue;
    const srcPath = join(srcDir, name);
    const destPath = join(destDir, name);
    const lst = lstatSync(srcPath);
    if (lst.isSymbolicLink()) {
      const target = readlinkSync(srcPath);
      ensureDir(dirname(destPath));
      symlinkSync(target, destPath);
    } else if (lst.isDirectory()) {
      copyDirInto(srcRoot, destRoot, rel === "" ? name : `${rel}/${name}`, stripRootMarker);
    } else if (lst.isFile()) {
      ensureDir(dirname(destPath));
      copyFileSync(srcPath, destPath);
    }
  }
}
