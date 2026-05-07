/**
 * Bundled known-tap registry snapshot (§16.2.1).
 *
 * This data is intentionally inert: commands must explicitly opt into
 * consulting it. Keeping it local lets discovery avoid first-run cloning
 * of every known tap.
 */

import type { KnownTap } from "./types.ts";

export const KNOWN_TAPS: readonly KnownTap[] = [];
