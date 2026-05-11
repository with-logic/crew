/**
 * Bundled known-tap registry snapshot (§16.2.1).
 *
 * This data is intentionally inert: commands must explicitly opt into
 * consulting it. Keeping it local lets discovery avoid first-run cloning
 * of every known tap.
 */

import { GENERATED_KNOWN_TAPS } from "./generated/index.ts";
import type { KnownTap } from "./types.ts";

const BUNDLED_KNOWN_TAPS: readonly KnownTap[] = GENERATED_KNOWN_TAPS;

let activeKnownTaps: readonly KnownTap[] = BUNDLED_KNOWN_TAPS;

export function getKnownTaps(): readonly KnownTap[] {
  return activeKnownTaps;
}

export function setKnownTapsForTest(taps: readonly KnownTap[]): void {
  activeKnownTaps = taps;
}

export function resetKnownTapsForTest(): void {
  activeKnownTaps = BUNDLED_KNOWN_TAPS;
}
