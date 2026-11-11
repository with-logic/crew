/**
 * Fixtures for the nested-manifest tests (§9.2).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Write an empty `.crewrc` in `<root>/<dir>`, creating the directory. */
export function addManifest(root: string, dir: string): void {
  mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, dir, ".crewrc"), "");
}
