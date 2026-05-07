/**
 * Conversion helpers for the bundled known-tap registry (§16.2.1).
 */

import type { TapConfig } from "../core/types.ts";
import type { KnownTap } from "./types.ts";

export function tapConfigFromKnownTap(tap: KnownTap): TapConfig {
  return {
    name: tap.name,
    kind: "git",
    registered: true,
    url: tap.url,
    subpath: tap.subpath,
    path: "",
  };
}
