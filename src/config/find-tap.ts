/**
 * Configured-tap lookup for commands whose argument is a tap NAME and
 * nothing else: §16.3 `crew tap remove` / `crew tap update`, §16.6
 * `crew search --tap`. For those, an unrecognized name is a `usage_error`
 * — the user named a tap that is not configured, and `crew tap list`
 * is the fix.
 *
 * Deliberately NOT used by install-side reference resolution
 * (`src/install/resolve-ref/`). There a bare word may be a tap, a
 * namespace, a skill, or a git shorthand, so a miss is `invalid_ref`
 * (§13) carrying disambiguation help, not a flat "no such tap".
 * Unifying the two would make install's error less specific, which is
 * the opposite of what §13's error-quality guidance asks for.
 *
 * Lives under `config/` rather than in any one command directory so
 * every eligible caller resolves a name the same way and reports an
 * unknown one with identical wording. `taps.ts` next door is about
 * parsing config.yaml entries; this is about finding one by name at
 * runtime.
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
