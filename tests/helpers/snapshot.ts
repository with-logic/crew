/** Snapshot regular-file bytes without following child links (§10.1.1 filesystem preservation). */

import { readFileSync } from "node:fs";
import { type WalkedEntry, walk } from "../../src/util/fs.ts";

/** Keep each suite's key format and accumulation order while sharing the filesystem reads. */
export function snapshotFiles(
  root: string,
  files: Record<string, Buffer>,
  key: (entry: WalkedEntry) => string,
): void {
  for (const entry of walk(root)) if (entry.isFile) files[key(entry)] = readFileSync(entry.absPath);
}

/** Snapshot regular files keyed by relative path while preserving traversal order (§10.1). */
export function snapshot(root: string): Record<string, Buffer> {
  const files: Record<string, Buffer> = {};
  snapshotFiles(root, files, (entry) => entry.relPath);
  return files;
}
