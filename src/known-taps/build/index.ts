/**
 * Build the bundled known-tap registry from pinned sources (§16.2.1).
 */

import { join } from "node:path";
import { ensureDir, rmrf } from "../../util/fs.ts";
import type { KnownTap } from "../types.ts";
import { indexKnownTapSource } from "./index-source.ts";
import type { KnownTapManifest } from "./types.ts";

export function buildKnownTapRegistry(
  manifest: KnownTapManifest,
  options: { readonly workDir: string },
): readonly KnownTap[] {
  rmrf(options.workDir);
  ensureDir(options.workDir);
  const taps: KnownTap[] = [];
  for (const source of manifest.taps) {
    taps.push(indexKnownTapSource(source, join(options.workDir, source.name)));
  }
  taps.sort((a, b) => a.name.localeCompare(b.name));
  return taps;
}
