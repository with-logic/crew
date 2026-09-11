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
 * Keyed by `name`, since that is the first thing every lookup filters on.
 */
export interface InstalledSourceIndex {
  readonly byName: ReadonlyMap<string, readonly IndexedEntry[]>;
}

interface IndexedEntry {
  readonly scope: Scope;
  readonly projectRoot: string | null;
  readonly identity: SourceIdentity;
}

/** Build the index for one re-expansion run. */
export function buildInstalledSourceIndex(state: StateFile, config: Config): InstalledSourceIndex {
  const byName = new Map<string, IndexedEntry[]>();
  const tapsByName = new Map(config.taps.map((t) => [t.name, t]));
  for (const entry of state.installations) {
    const tap = tapsByName.get(entry.source.tap);
    if (!tap) continue;
    const bucket = byName.get(entry.name);
    const indexed: IndexedEntry = {
      scope: entry.scope,
      projectRoot: entry.project_root ?? null,
      identity: sourceIdentityOf(tap, entry.source.path),
    };
    if (bucket) bucket.push(indexed);
    else byName.set(entry.name, [indexed]);
  }
  return { byName };
}

/**
 * True when `name` is already installed at this scope and project root
 * from the same canonical source, through any tap row.
 */
export function indexHasSameSource(
  index: InstalledSourceIndex,
  args: {
    readonly name: string;
    readonly scope: Scope;
    readonly projectRoot: string | null;
    readonly tap: TapConfig;
    readonly tapRelativePath: string;
  },
): boolean {
  const candidates = index.byName.get(args.name);
  if (!candidates) return false;
  const incoming = sourceIdentityOf(args.tap, args.tapRelativePath);
  for (const c of candidates) {
    if (c.scope !== args.scope) continue;
    if (c.projectRoot !== args.projectRoot) continue;
    if (sameSourceIdentity(c.identity, incoming)) return true;
  }
  return false;
}
