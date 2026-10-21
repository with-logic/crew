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

import { existsSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { crewHome, paths, storeEntryPath } from "../core/paths.ts";
import { hashDirectory } from "../hash/content.ts";
import { assertSkillFile } from "../skill/file.ts";
import { atomicReplace, ensureDir } from "../util/fs.ts";
import { progress } from "../util/progress.ts";
import { safePath } from "../util/redact.ts";
import { copySourceFile, copySourceTree, hashSourceDirectory } from "./read.ts";

/** Record returned after staging. */
export interface StoredSkill {
  readonly storePath: string;
  readonly contentHash: string;
  readonly shortSha: string;
  /** True if the store entry was reused (bytes already present). */
  readonly reused: boolean;
}

/**
 * Copy a directory or selected gist file into `<name>@<short-sha>`. If the
 * entry already exists with a matching content hash, the existing one
 * is reused.
 */
export function stageIntoStore(
  sourcePath: string,
  name: string,
  resolvedSha: string | null,
  home: string = crewHome(),
  sourceHash?: string,
  isGistFile = false,
): StoredSkill {
  // A path source with no SHA uses the hash itself as the short id so
  // different path-installed skills don't collide in the store.
  // `sourceHash`, when the caller already hashed `sourcePath`, avoids
  // walking the same unbounded tree twice.
  const shortSha = shortShaFor(sourcePath, resolvedSha, sourceHash);
  const storePath = storeEntryPath(name, shortSha, home);

  if (existsSync(storePath)) {
    progress(`reusing store entry ${safePath(name)}@${shortSha}`);
    const existingHash = hashDirectory(storePath);
    return { storePath, contentHash: existingHash, shortSha, reused: true };
  }
  progress(`staging ${safePath(name)}@${shortSha} into ${safePath(storePath)}`);

  ensureDir(join(storePath, "..")); // parents
  const staging = mkdtempSync(`${storePath}.staging-`);
  if (isGistFile) {
    assertSkillFile(sourcePath);
    copySourceFile(sourcePath, join(staging, "SKILL.md"));
  } else copySourceTree(sourcePath, staging, paths(home).storeDir);
  atomicReplace(staging, storePath);

  const contentHash = hashDirectory(storePath);
  return { storePath, contentHash, shortSha, reused: false };
}

/**
 * First 8 chars of a SHA, or of a hash of the source dir for path
 * sources. `sourceHash` lets a caller that already hashed `sourcePath`
 * skip a second full walk; it must be a `hashDirectory` digest of that
 * same directory.
 */
export function shortShaFor(
  sourcePath: string,
  resolvedSha: string | null,
  sourceHash?: string,
): string {
  if (resolvedSha !== null) return resolvedSha.slice(0, 8);
  // Path source: derive a stable short id from the directory's content hash.
  const digest = sourceHash ?? hashSourceDirectory(sourcePath); // `sha256:xxxx...`
  return digest.slice("sha256:".length, "sha256:".length + 8);
}
