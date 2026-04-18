/**
 * Content hash (§12.1).
 *
 * Deterministic SHA-256 over a directory's contents. This is what crew
 * uses to detect user customization: the hash is stored in the marker at
 * install time, and recomputed before every reinstall or update. A match
 * means crew still owns the directory exactly as it placed it; a mismatch
 * means the user has edited files.
 *
 * The algorithm:
 *
 *   1. Walk the directory. Exclude `.crew.json` at the walk root. Never
 *      follow symlinks out of the tree.
 *   2. Collect tuples of `(POSIX-relative-path, sha256(file-bytes))` for
 *      regular files, and `(POSIX-relative-path, sha256(link-target-bytes))`
 *      for symlinks.
 *   3. Sort tuples by relative path using byte-wise comparison.
 *   4. Feed each tuple into a SHA-256 accumulator as:
 *        `path-bytes || 0x00 || hex-lower(file-sha) || 0x0A`
 *   5. Output `"sha256:" + hex-lower(accumulator-digest)`.
 *
 * Deliberate exclusions: mode bits, mtime/ctime/atime, ownership, xattrs,
 * empty directories.
 */

import { createHash } from "node:crypto";
import { readFileSync, readlinkSync } from "node:fs";
import { walk } from "../util/fs.ts";

/**
 * Compute the content hash of a directory.
 *
 * @param dir - directory path to hash.
 * @returns `sha256:<64 hex chars>` — always 71 characters total.
 */
export function hashDirectory(dir: string): string {
  type Tuple = { relPath: string; fileSha: string };
  const tuples: Tuple[] = [];

  const entries = walk(dir, {
    shouldEmit: (e) => (e.isFile || e.isSymlink) && !(e.relPath === ".crew.json"),
  });

  for (const e of entries) {
    if (e.relPath === ".crew.json") {
      continue; // belt-and-suspenders — marker exclusion is at the root.
    }
    let fileSha: string;
    if (e.isSymlink) {
      fileSha = sha256OfBytes(Buffer.from(readlinkSync(e.absPath), "utf8"));
    } else {
      fileSha = sha256OfBytes(readFileSync(e.absPath));
    }
    tuples.push({ relPath: e.relPath, fileSha });
  }

  // §12.1 step 3: sort by byte-wise comparison of the POSIX relative path.
  tuples.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));

  const acc = createHash("sha256");
  for (const t of tuples) {
    acc.update(Buffer.from(t.relPath, "utf8"));
    acc.update(Buffer.from([0x00]));
    acc.update(Buffer.from(t.fileSha, "utf8"));
    acc.update(Buffer.from([0x0a]));
  }
  return `sha256:${acc.digest("hex")}`;
}

/** SHA-256 of a byte buffer as lowercase hex. */
export function sha256OfBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
