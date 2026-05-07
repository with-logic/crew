/**
 * Types for the bundled known-tap registry (§16.2.1).
 */

export type KnownTapTrust = "official" | "curated";

export interface KnownTapSkill {
  readonly name: string;
  readonly namespace: string | null;
  readonly description: string;
  /** POSIX path to the skill directory, relative to the tap root. */
  readonly path: string;
}

export interface KnownTap {
  readonly name: string;
  readonly url: string;
  readonly subpath: string;
  readonly description: string;
  readonly trust: KnownTapTrust;
  readonly skills: readonly KnownTapSkill[];
}

export interface KnownTapHit {
  readonly tap: KnownTap;
  readonly skill: KnownTapSkill;
}
