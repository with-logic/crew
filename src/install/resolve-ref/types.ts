/**
 * Shared types for tap-reference resolution (§8.3).
 *
 * Split out so bare-name resolution (`./index.ts`) and qualified
 * resolution (`./qualified.ts`) can both reach them without either
 * importing the other.
 */

import type { NameCandidate } from "../attribute-bare-name.ts";

/** Force-one-kind hint from a `--tap` / `--bundle` / `--skill` flag. */
export type SpecificKindHint = "tap" | "namespace" | "skill";
export type KindHint = SpecificKindHint | "non-tap" | null;

/**
 * Already-materialized root directories, keyed by tap name. A
 * ref-carrying reference exports its commit first and passes the result
 * here, so resolution reads the requested commit rather than the shared
 * clone's checked-out revision (§9 step 3).
 */
export type TapRoots = Readonly<Record<string, string | undefined>>;

export type NonTapNameCandidate = Exclude<NameCandidate, { readonly kind: "tap" }>;
