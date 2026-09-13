/**
 * "Is this already installed from the same place?" lookup (§5.4).
 *
 * Tap re-expansion walks a tap's children and installs the ones state
 * doesn't know about. Membership alone isn't enough to decide that: the
 * same directory in the same repo can be attributed to a different tap
 * row, so a child that looks new to this tap group may already be
 * installed. Comparing canonical source identity avoids "adding" a skill
 * the user already has, which would collide on the install path.
 */

import type { Config, Scope, StateFile, TapConfig } from "../core/types.ts";
import { type SourceIdentity, sameSourceIdentity, sourceIdentityOf } from "./source-identity.ts";

/**
 * An index of installed source identities, built once so re-expansion
 * doesn't rescan every state entry (and every tap row inside
 * `identityOfStateSource`) for each upstream child it considers.
 *
 * Keyed by the full install location — name, scope, and project root —
 * rather than by name alone. A skill installed in several projects has
 * one bucket per project instead of one shared bucket every lookup has
 * to filter, so a multi-project re-expansion stays O(1) per child.
 *
 * The index is mutable on purpose: re-expansion installs as it walks,
 * and a later tap group must see what an earlier one just added (see
 * `noteInstalled`).
 */
export interface InstalledSourceIndex {
  readonly byLocation: Map<string, SourceIdentity[]>;
}

/** Bucket key: one install location. */
function locationKey(name: string, scope: Scope, projectRoot: string | null): string {
  return JSON.stringify([name, scope, projectRoot ?? ""]);
}

/** Build the index for one re-expansion run. */
export function buildInstalledSourceIndex(state: StateFile, config: Config): InstalledSourceIndex {
  const byLocation = new Map<string, SourceIdentity[]>();
  const tapsByName = new Map(config.taps.map((t) => [t.name, t]));
  for (const entry of state.installations) {
    const tap = tapsByName.get(entry.source.tap);
    if (!tap) continue;
    const key = locationKey(entry.name, entry.scope, entry.project_root ?? null);
    const identity = sourceIdentityOf(tap, entry.source.path);
    const bucket = byLocation.get(key);
    if (bucket) bucket.push(identity);
    else byLocation.set(key, [identity]);
  }
  return { byLocation };
}

/** Arguments identifying one candidate install location + source. */
interface LookupArgs {
  readonly name: string;
  readonly scope: Scope;
  readonly projectRoot: string | null;
  readonly tap: TapConfig;
  readonly tapRelativePath: string;
}

/**
 * True when `name` is already installed at this scope and project root
 * from the same canonical source, through any tap row.
 */
export function indexHasSameSource(index: InstalledSourceIndex, args: LookupArgs): boolean {
  const candidates = index.byLocation.get(locationKey(args.name, args.scope, args.projectRoot));
  if (!candidates) return false;
  const incoming = sourceIdentityOf(args.tap, args.tapRelativePath);
  return candidates.some((identity) => sameSourceIdentity(identity, incoming));
}

/**
 * Record a skill this run just installed, so a later tap group sees it.
 *
 * Two tap rows can point at the same repository (one at the root, one at
 * a subpath), which puts their entries in different re-expansion groups.
 * Without this, both groups would discover the same new upstream child
 * against a stale snapshot and install it twice, leaving the marker and
 * the state entry attributed to different taps.
 */
export function noteInstalled(index: InstalledSourceIndex, args: LookupArgs): void {
  const key = locationKey(args.name, args.scope, args.projectRoot);
  const identity = sourceIdentityOf(args.tap, args.tapRelativePath);
  const bucket = index.byLocation.get(key);
  if (bucket) bucket.push(identity);
  else index.byLocation.set(key, [identity]);
}
