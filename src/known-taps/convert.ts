/**
 * Conversion helpers for the bundled known-tap registry (§16.2.1).
 */

import type { TapConfig } from "../core/types.ts";
import type { KnownTap } from "./types.ts";

/**
 * Convert a known tap into a user-registered git tap after the user
 * chooses to add it. Discovery-only rendering must not persist this.
 */
export function tapConfigFromKnownTap(tap: KnownTap): TapConfig {
  return {
    name: tap.name,
    // Known taps are git taps by construction; path taps are local state.
    kind: "git",
    registered: true,
    url: tap.url,
    subpath: tap.subpath,
    path: "",
  };
}
