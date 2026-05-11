/**
 * Manifest file formatting for known-tap maintenance (§16.2.1).
 */

import type { KnownTapManifest } from "../../src/known-taps/build/types.ts";
import { writeText } from "../../src/util/fs.ts";

export function writeKnownTapManifest(path: string, manifest: KnownTapManifest): void {
  const lines = ["{", '  "version": 1,', '  "taps": ['];
  for (const [index, tap] of manifest.taps.entries()) {
    const suffix = index === manifest.taps.length - 1 ? "" : ",";
    lines.push(`    ${JSON.stringify(tap)}${suffix}`);
  }
  lines.push("  ]", "}");
  writeText(path, `${lines.join("\n")}\n`);
}
