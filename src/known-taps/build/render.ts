/**
 * Render generated known-tap registry data as TypeScript (§16.2.1).
 */

import type { KnownTap } from "../types.ts";

export function renderKnownTapRegistry(taps: readonly KnownTap[]): string {
  const json = JSON.stringify(taps, null, 2);
  return `/**
 * Generated known-tap registry data (§16.2.1).
 *
 * Do not edit by hand. Run \`bun run known-taps build\` after changing
 * \`known-taps/manifest.json\`.
 */

import type { KnownTap } from "./types.ts";

export const GENERATED_KNOWN_TAPS = ${json} as const satisfies readonly KnownTap[];
`;
}
