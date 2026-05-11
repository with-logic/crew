/**
 * Build-time types for the bundled known-tap registry (§16.2.1).
 */

import type { KnownTapTrust } from "../types.ts";

export interface KnownTapManifest {
  readonly version: 1;
  readonly taps: readonly KnownTapSource[];
}

export interface KnownTapSource {
  readonly name: string;
  readonly url: string;
  readonly subpath: string;
  readonly description: string;
  readonly trust: KnownTapTrust;
  /** Full commit SHA that was reviewed and should be indexed. */
  readonly commit: string;
  /** Human hint for refresh automation; release builds never follow it. */
  readonly trackingRef?: string;
}
