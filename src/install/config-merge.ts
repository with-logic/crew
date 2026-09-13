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
 * These helpers replay the resolver's changes onto fresh config, and
 * refuse to proceed when a tap the install depends on is gone.
 */

import { CrewError } from "../core/errors.ts";
import type { Config, ResolvedSkill, TapConfig } from "../core/types.ts";

/**
 * Fresh config with the resolver's changes replayed onto it.
 *
 * The resolver does exactly two things to its stale snapshot: it APPENDS
 * a new auto tap, or it UPGRADES an existing tap's `discovery` in place
 * (`crew install --recursive` against an already-registered tap). It
 * never removes one. Classifying each tap in `extended` by whether its
 * name was in `before` and is in `fresh` covers every case:
 *
 *   - not in `before`, not in `fresh` → the resolver added it; keep it.
 *   - not in `before`, in `fresh`     → another process added the same
 *     name concurrently; keep fresh's row rather than clobbering it.
 *   - in `before`, not in `fresh`     → concurrently REMOVED. The
 *     resolver never deletes, so removal is the only explanation; it
 *     stays removed.
 *   - in `before`, in `fresh`         → may be a resolver modification.
 *
 * "Absent from `fresh`" is ambiguous on its own, which is why `before`
 * is needed to tell a concurrent removal apart from a modification.
 *
 * A modification is applied as the resolver's DELTA (only the fields it
 * actually changed) rather than by overwriting fresh's row, so a
 * concurrent edit to an unrelated field survives.
 */
export function mergeAutoTaps(fresh: Config, before: Config, extended: Config): Config {
  const beforeByName = new Map(before.taps.map((t) => [t.name, t]));
  const freshByName = new Map(fresh.taps.map((t) => [t.name, t]));
  const added: TapConfig[] = [];
  // Names whose `discovery` the resolver upgraded on a tap that still exists.
  const upgraded = new Set<string>();
  for (const t of extended.taps) {
    const original = beforeByName.get(t.name);
    if (!original) {
      // New to the resolver. If fresh already has the name, a concurrent
      // writer got there first and its row wins.
      if (!freshByName.has(t.name)) added.push(t);
      continue;
    }
    // Present in `before`: only a concurrent removal can drop it from
    // `fresh`, and a removed tap must stay removed.
    if (!freshByName.has(t.name)) continue;
    if (t.discovery === "recursive" && original.discovery !== "recursive") upgraded.add(t.name);
  }
  if (added.length === 0 && upgraded.size === 0) return fresh;
  const taps: TapConfig[] = [];
  for (const t of fresh.taps) {
    taps.push(upgraded.has(t.name) ? { ...t, discovery: "recursive" } : t);
  }
  return { ...fresh, taps: [...taps, ...added] };
}

/**
 * Identity of a tap's SOURCE, independent of the name pointing at it.
 * A name is a mutable label: `tap remove` + `tap add` can rebind it to a
 * different repo between resolution and the lock. State records skills
 * by tap NAME, so the bytes we resolved must still belong to the source
 * that name denotes, or the entry would attribute A's bytes to B.
 */
function sourceIdentity(tap: TapConfig): string {
  return JSON.stringify([tap.kind, tap.url, tap.subpath, tap.path]);
}

/**
 * Fail before writing state that would reference a tap that is no longer
 * in config, or whose name now denotes a DIFFERENT source. Concurrent
 * removal (or removal + re-add) is the only way to reach either, so the
 * message says to retry rather than blaming the reference.
 */
export function assertTapsPresent(config: Config, skills: readonly ResolvedSkill[]): void {
  const byName = new Map(config.taps.map((t) => [t.name, t]));
  for (const skill of skills) {
    const current = byName.get(skill.tap.name);
    if (current && sourceIdentity(current) === sourceIdentity(skill.tap)) continue;
    const verb = current ? "was replaced" : "was removed";
    throw new CrewError(
      "source_unreachable",
      `tap \`${skill.tap.name}\` ${verb} while \`${skill.name}\` was being resolved — nothing was installed; run the command again`,
      { tap: skill.tap.name, skill: skill.name },
    );
  }
}
