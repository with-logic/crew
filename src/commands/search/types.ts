/**
 * Shared result types for `crew search` (§16.6).
 */

import type { KnownTapTrust } from "../../known-taps/types.ts";

export interface SearchHit {
  readonly tap: string;
  readonly name: string;
  readonly namespace: string | null;
  readonly description: string;
  readonly installed: boolean;
}

export interface KnownSearchHit {
  readonly tap: string;
  readonly url: string;
  readonly subpath: string;
  readonly trust: KnownTapTrust;
  readonly name: string;
  readonly namespace: string | null;
  readonly description: string;
}

export interface ConfiguredSearchResult {
  readonly hits: SearchHit[];
  readonly warnings: string[];
}
