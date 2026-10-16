/**
 * One-way flag promotion for the install flow (§9 step 10, §11.1).
 *
 * An already-installed skill skips `performInstall`, which otherwise
 * records these flags. A skill first pulled in as a dependency has
 * `explicit: false`, and is promoted when the user later names it
 * directly; one installed on its own has no `tracks_tap`, and is promoted
 * when the user later installs its whole tap (§10.1.1). Neither flag ever
 * demotes.
 */

import type { Scope, StateFile } from "../core/types.ts";

/** The (name, scope) entries to promote, by flag. */
export interface Promotions {
  readonly explicit: readonly string[];
  readonly tracksTap: readonly string[];
}

/**
 * Set `explicit` and `tracks_tap` on the named entries at `scope`.
 * Idempotent; any name not present at that scope is silently ignored.
 */
export function promoteFlags(
  state: StateFile,
  promotions: Promotions,
  scope: Scope,
  projectRoot: string | null,
): StateFile {
  if (promotions.explicit.length === 0 && promotions.tracksTap.length === 0) return state;
  const explicit = new Set(promotions.explicit);
  const tracksTap = new Set(promotions.tracksTap);
  return {
    schema_version: 1,
    installations: state.installations.map((e) => {
      if (e.scope !== scope || (e.project_root ?? null) !== projectRoot) return e;
      return {
        ...e,
        ...(explicit.has(e.name) ? { explicit: true } : {}),
        ...(tracksTap.has(e.name) ? { tracks_tap: true } : {}),
      };
    }),
  };
}
