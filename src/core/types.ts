/**
 * Shared types for crew's domain model.
 *
 * These types mirror the structures defined in the spec (SKILL.md, markers,
 * state.json, config.yaml, etc.). Keeping them in one place means every
 * module can depend on a single canonical shape.
 */

/** Install scope — user-wide or project-local. */
export type Scope = "user" | "project";

/** Source kinds a skill can come from. */
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
  /** Skill name. */
  readonly name: string;
  /** Ref if the user appended `@ref`, otherwise null. */
  readonly ref: string | null;
}

/** Discriminated union of every source a ref can parse to. */
export type Source = PathSource | GitSource | TapSource;

/** Frontmatter fields crew cares about from SKILL.md. */
export interface SkillFrontmatter {
  readonly name: string;
  readonly description: string;
  readonly license?: string;
  readonly compatibility?: string;
  readonly metadata?: {
    readonly crew?: {
      readonly homepage?: string;
      readonly dependencies?: readonly string[];
    };
  };
}

/** A skill on disk: the directory, the parsed frontmatter, and its raw SKILL.md. */
export interface LoadedSkill {
  /** Absolute path to the skill's directory. */
  readonly path: string;
  /** Parsed frontmatter. */
  readonly frontmatter: SkillFrontmatter;
  /** Raw SKILL.md bytes. */
  readonly skillMd: string;
}

/** The shape written into every `.crew.json` marker per §7.5. */
export interface Marker {
  readonly schema_version: 1;
  readonly name: string;
  readonly source: MarkerSource;
  readonly ref: string | null;
  readonly resolved_sha: string | null;
  readonly content_hash: string;
  readonly scope: Scope;
  readonly installed_at: string;
  readonly installed_by: string;
}

/** Source sub-record inside a marker. Shape is kinded for JSON. */
export type MarkerSource =
  | { readonly type: "tap"; readonly tap: string; readonly path: string }
  | { readonly type: "git"; readonly url: string; readonly subpath: string }
  | { readonly type: "path"; readonly path: string };

/** An entry in state.json per §11.1. */
export interface StateEntry {
  readonly name: string;
  readonly source: MarkerSource;
  readonly ref: string | null;
  readonly resolved_sha: string | null;
  readonly content_hash: string;
  readonly scope: Scope;
  readonly installed_at: string;
  readonly targets: readonly string[];
  readonly pinned: boolean;
}

/** The state.json file on disk. */
export interface StateFile {
  readonly schema_version: 1;
  readonly installations: readonly StateEntry[];
}

/** A tap configured in config.yaml. */
export interface TapConfig {
  readonly name: string;
  readonly url: string;
}

/** The parsed, normalized config.yaml. */
export interface Config {
  readonly taps: readonly TapConfig[];
  readonly disabled_targets: readonly string[];
  readonly forced_targets: readonly string[];
  readonly autoupdate: {
    readonly enabled: boolean;
    readonly interval_seconds: number;
  };
}

/** A resolved skill ready to be installed: materialized contents and identity. */
export interface ResolvedSkill {
  /** Absolute path to the content in the store. */
  readonly storePath: string;
  /** The frontmatter name. */
  readonly name: string;
  /** Loaded frontmatter for dependency walking. */
  readonly frontmatter: SkillFrontmatter;
  /** What the marker's `source` field should be. */
  readonly markerSource: MarkerSource;
  /** The ref the user asked for. */
  readonly ref: string | null;
  /** Full 40-char SHA, or null for path sources. */
  readonly resolvedSha: string | null;
  /** Whether the install counts as pinned (SHA or tag). */
  readonly pinned: boolean;
  /** Content hash of the store entry. */
  readonly contentHash: string;
}
