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
import { identityOfStateSource, sameSourceIdentity, sourceIdentityOf } from "./source-identity.ts";

/**
 * True when `name` is already installed at this scope and project root
 * from the same canonical source, through any tap row.
 */
export function installedFromSameSource(args: {
  readonly state: StateFile;
  readonly config: Config;
  readonly name: string;
  readonly scope: Scope;
  readonly projectRoot: string | null;
  readonly tap: TapConfig;
  readonly tapRelativePath: string;
}): boolean {
  const incoming = sourceIdentityOf(args.tap, args.tapRelativePath);
  for (const entry of args.state.installations) {
    if (entry.name !== args.name) continue;
    if (entry.scope !== args.scope) continue;
    if ((entry.project_root ?? null) !== args.projectRoot) continue;
    const existing = identityOfStateSource(entry.source, args.config.taps);
    if (existing && sameSourceIdentity(existing, incoming)) return true;
  }
  return false;
}
