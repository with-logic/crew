/**
 * Reconciling resolver-created auto taps with config as it stands at
 * lock time (§14, §16.5).
 *
 * Reference resolution runs BEFORE the state lock, so the config the
 * resolver extended is a snapshot that may already be stale: a
 * concurrent `crew tap remove` can drop a tap in the gap. Writing the
 * extended snapshot back wholesale would resurrect that tap, and
 * installing against it would record a state entry pointing at a tap
 * the user just removed.
 *
 * These helpers keep only the taps the resolver actually ADDED, and
 * refuse to proceed when a tap the install depends on is gone.
 */

import { CrewError } from "../core/errors.ts";
import type { Config, ResolvedSkill, TapConfig } from "../core/types.ts";

/**
 * Fresh config plus the taps the resolver added to its stale snapshot.
 *
 * Taps removed since the snapshot stay removed — they are absent from
 * `fresh` and were never in `added`, so they cannot come back.
 */
export function mergeAutoTaps(fresh: Config, before: Config, extended: Config): Config {
  const known = new Set<string>();
  for (const t of before.taps) known.add(t.name);
  for (const t of fresh.taps) known.add(t.name);
  const added: TapConfig[] = [];
  for (const t of extended.taps) {
    if (known.has(t.name)) continue;
    added.push(t);
  }
  if (added.length === 0) return fresh;
  return { ...fresh, taps: [...fresh.taps, ...added] };
}

/**
 * Fail before writing state that would reference a tap no longer in
 * config. Concurrent removal is the only way to reach this, so the
 * message says to retry rather than blaming the reference.
 */
export function assertTapsPresent(config: Config, skills: readonly ResolvedSkill[]): void {
  const names = new Set(config.taps.map((t) => t.name));
  for (const skill of skills) {
    if (names.has(skill.tap.name)) continue;
    throw new CrewError(
      "source_unreachable",
      `tap \`${skill.tap.name}\` was removed while \`${skill.name}\` was being resolved — nothing was installed; run the command again`,
      { tap: skill.tap.name, skill: skill.name },
    );
  }
}
