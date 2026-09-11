/**
 * Configured-tap lookup by name, shared by every command that takes a
 * tap name (§16.3 `crew tap remove` / `crew tap update`, §16.6
 * `crew search --tap`).
 *
 * Lives under `config/` rather than in any one command directory so
 * that every caller resolves a name the same way and reports an unknown
 * one with identical wording. `taps.ts` next door is about parsing
 * config.yaml entries; this is about finding one by name at runtime.
 */

import { CrewError } from "../core/errors.ts";
import type { TapConfig } from "../core/types.ts";

/** Resolve a tap name against the configured taps, or throw `usage_error`. */
export function requireConfiguredTap(taps: readonly TapConfig[], name: string): TapConfig {
  const tap = taps.find((t) => t.name === name);
  if (!tap) {
    throw new CrewError(
      "usage_error",
      `\`${name}\` was not found in your list of taps.`,
      { name },
      "This may have been a typo. View your configured taps with `crew tap list`.",
    );
  }
  return tap;
}
