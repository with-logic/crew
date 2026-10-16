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

import { copyFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { CrewError } from "../core/errors.ts";
import { crewHome, paths, storeEntryPath } from "../core/paths.ts";
import { hashDirectory } from "../hash/content.ts";
import { isSkillFile } from "../skill/skill-file.ts";
import { copyTree } from "../util/copy.ts";
import { errnoReason, isGoneError, unreadablePathError } from "../util/errno.ts";
import { atomicReplace, ensureDir, exists, rmrf } from "../util/fs.ts";
import { progress } from "../util/progress.ts";
import { isReadable } from "../util/readable.ts";
import { safePath } from "../util/redact.ts";
import { climbsOut } from "../util/relative-path.ts";

/** Record returned after staging. */
export interface StoredSkill {
  readonly storePath: string;
  readonly contentHash: string;
  readonly shortSha: string;
  /** True if the store entry was reused (bytes already present). */
  readonly reused: boolean;
}

/**
 * Copy the skill at `skillPath` (a directory, or a gist's skill file)
 * into the store under `<name>@<short-sha>`. If the entry already exists
 * with a matching content hash, the existing one is reused.
 *
 * Every failure is a `source_unreachable` `CrewError` (§9 step 8): one
 * naming a file of the skill crew can't read (`details.path`), or one
 * naming crew's own store (`details.store`) when crew can't use it.
 */
export function stageIntoStore(
  skillPath: string,
  name: string,
  resolvedSha: string | null,
  home: string = crewHome(),
  sourceHash?: string,
): StoredSkill {
  try {
    return stage(skillPath, name, resolvedSha, home, sourceHash);
  } catch (err) {
    // Staging only touches the filesystem, so what it throws is an errno error.
    throw stagingError(err as NodeJS.ErrnoException, skillPath, home);
  }
}

function stage(
  skillPath: string,
  name: string,
  resolvedSha: string | null,
  home: string,
  sourceHash: string | undefined,
): StoredSkill {
  // A path source with no SHA uses the hash itself as the short id so
  // different path-installed skills don't collide in the store.
  // `sourceHash`, when the caller already hashed `skillPath`, avoids
  // walking the same unbounded tree twice.
  const shortSha = shortShaFor(skillPath, resolvedSha, sourceHash);
  const storePath = storeEntryPath(name, shortSha, home);

  if (existsSync(storePath)) {
    progress(`reusing store entry ${safePath(name)}@${shortSha}`);
    const existingHash = hashDirectory(storePath);
    return { storePath, contentHash: existingHash, shortSha, reused: true };
  }
  progress(`staging ${safePath(name)}@${shortSha} into ${safePath(storePath)}`);

  const staging = `${storePath}.staging-${Date.now()}`;
  if (exists(staging)) rmrf(staging);
  try {
    copySkill(skillPath, staging);
    ensureDir(join(storePath, "..")); // parents
    atomicReplace(staging, storePath);
  } catch (err) {
    // A partial copy is never left behind for `crew doctor` to report.
    rmrf(staging);
    throw err;
  }

  const contentHash = hashDirectory(storePath);
  return { storePath, contentHash, shortSha, reused: false };
}

/** True when a `stageIntoStore` failure is crew's own store, not the skill. */
export function isStoreFault(err: CrewError): boolean {
  return "store" in err.details;
}

/**
 * A staging failure as a §13 error: a file of the skill crew can't read
 * names that file; anything else is crew's own store. Reading a file of
 * the skill — or the file going away mid-copy, as the source is edited —
 * is the skill's. Only a copy is ambiguous: Node names its source file
 * even when writing failed, so a source crew can still read wasn't what
 * broke (a full disk, say).
 */
export function stagingError(
  err: NodeJS.ErrnoException,
  skillPath: string,
  home: string,
): CrewError {
  const file = err.path ?? skillPath;
  const inSkill = !climbsOut(relative(skillPath, file));
  if (inSkill && (err.syscall !== "copyfile" || isGoneError(err) || !isReadable(file))) {
    return unreadablePathError(file, err, "read");
  }
  const store = paths(home).storeDir;
  return new CrewError(
    "source_unreachable",
    `couldn't use crew's store at \`${store}\` — ${errnoReason(err)}`,
    { store },
    `Check that \`${store}\` and the folders above it are writable by you, and that the disk has room.`,
  );
}

/**
 * Copy a skill's files into `dest`. A gist skill is a single file, and
 * it becomes the `SKILL.md` of its own directory (§9 step 8).
 */
function copySkill(source: string, dest: string): void {
  if (isSkillFile(source)) {
    ensureDir(dest);
    copyFileSync(source, join(dest, "SKILL.md"));
  } else {
    copyTree(source, dest, { stripRootMarker: true });
  }
}

/**
 * First 8 chars of a SHA, or of a hash of the skill directory for path
 * sources (which never hold gist skill files). `sourceHash` lets a
 * caller that already hashed `skillDir` skip a second full walk; it must
 * be a `hashDirectory` digest of that same directory.
 */
export function shortShaFor(
  skillDir: string,
  resolvedSha: string | null,
  sourceHash?: string,
): string {
  if (resolvedSha !== null) return resolvedSha.slice(0, 8);
  // Path source: derive a stable short id from the directory's content hash.
  const digest = sourceHash ?? hashDirectory(skillDir); // `sha256:xxxx...`
  return digest.slice("sha256:".length, "sha256:".length + 8);
}
