/**
 * Content-addressed store (§6, §9 step 8).
 *
 * After a skill is acquired and validated, its canonical bytes are
 * staged into `~/.crew/store/<name>@<short-sha>/`. Installing into a
 * target is then a copy from the store, never from the source. This
 * means:
 *
 *   - every target gets the same bytes;
 *   - a reinstall from the same SHA is a cheap copy, not a network op;
 *   - `crew cache clean` has a clear contract — remove store entries no
 *     longer referenced by state or any marker.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { crewHome, storeEntryPath } from "../core/paths.ts";
import { hashDirectory } from "../hash/content.ts";
import { atomicReplace, ensureDir, exists, rmrf } from "../util/fs.ts";
import { copyTree } from "../util/copy.ts";

/** Record returned after staging. */
export interface StoredSkill {
  readonly storePath: string;
  readonly contentHash: string;
  readonly shortSha: string;
  /** True if the store entry was reused (bytes already present). */
  readonly reused: boolean;
}

/**
 * Copy `sourceDir` into the store under `<name>@<short-sha>`. If the
 * entry already exists with a matching content hash, the existing one
 * is reused.
 */
export function stageIntoStore(sourceDir: string, name: string, resolvedSha: string | null, home: string = crewHome()): StoredSkill {
  // A path source with no SHA uses the hash itself as the short id so
  // different path-installed skills don't collide in the store.
  const shortSha = shortShaFor(sourceDir, resolvedSha);
  const storePath = storeEntryPath(name, shortSha, home);

  if (existsSync(storePath)) {
    const existingHash = hashDirectory(storePath);
    return { storePath, contentHash: existingHash, shortSha, reused: true };
  }

  const staging = `${storePath}.staging-${Date.now()}`;
  if (exists(staging)) rmrf(staging);
  copyTree(sourceDir, staging, { stripRootMarker: true });
  ensureDir(join(storePath, "..")); // parents
  atomicReplace(staging, storePath);

  const contentHash = hashDirectory(storePath);
  return { storePath, contentHash, shortSha, reused: false };
}

/** First 8 chars of a SHA, or of a hash of the source dir for path sources. */
export function shortShaFor(sourceDir: string, resolvedSha: string | null): string {
  if (resolvedSha !== null) return resolvedSha.slice(0, 8);
  // Path source: derive a stable short id from the directory's content hash.
  const digest = hashDirectory(sourceDir); // `sha256:xxxx...`
  return digest.slice("sha256:".length, "sha256:".length + 8);
}
