/**
 * Reference parser output types (§8).
 */

/** Source kinds a skill reference can parse to. */
export type SourceKind = "path" | "git" | "tap";

/** A resolved, absolute path reference. */
export interface PathSource {
  readonly type: "path";
  /** Absolute path at parse time. */
  readonly path: string;
}

/** A git reference: URL plus optional ref plus optional subpath. */
export interface GitSource {
  readonly type: "git";
  /** Canonical clone URL (https://... or git@...). */
  readonly url: string;
  /** The ref the user asked for (tag/branch/SHA) or null if unspecified. */
  readonly ref: string | null;
  /** POSIX subpath within the repo. Empty string means repo root. */
  readonly subpath: string;
}

/** A tap reference: optionally-qualified skill name with optional ref. */
export interface TapSource {
  readonly type: "tap";
  /** Tap name if qualified, null if bare. */
  readonly tap: string | null;
  /**
   * Namespace within the tap if qualified, null if unnamespaced or
   * unknown at parse time. A 3-segment ref (`tap/ns/skill`) sets this
   * directly; a 2-segment ref (`foo/bar`) leaves it null and lets the
   * resolver decide between tap-first and namespace-first.
   */
  readonly namespace: string | null;
  /** Skill name. */
  readonly name: string;
  /** Ref if the user appended `@ref`, otherwise null. */
  readonly ref: string | null;
}

/** Discriminated union of every source a ref can parse to. */
export type Source = PathSource | GitSource | TapSource;
