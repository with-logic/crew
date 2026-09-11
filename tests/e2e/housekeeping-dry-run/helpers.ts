/**
 * Shared helpers for the `--dry-run` housekeeping suites (§5.2).
 *
 * Each command has its own file in this directory; everything they
 * share about reading on-disk state back lives here.
 */

import { existsSync, readFileSync } from "node:fs";

/** File contents, or null when the file doesn't exist. */
export function readOrNull(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}
