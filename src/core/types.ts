/**
 * Shared types for crew's domain model.
 *
 * These types mirror the structures defined in the spec (SKILL.md, markers,
 * state.json, config.yaml, etc.). Keeping them in one place means every
 * module can depend on a single canonical shape.
 */

/** Install scope — user-wide or project-local. */
export type Scope = "user" | "project";

// -----------------------------------------------------------------------------
// Reference parsing — what `parseRef` returns. Used at install time before
// any tap attribution happens.
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// SKILL.md
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// Marker (`.crew.json`)
//
// Self-describing — carries enough source info that `crew doctor --repair`
// can rebuild a missing tap row from scratch.
// -----------------------------------------------------------------------------

/** The shape written into every `.crew.json` marker per §7.5. */
export interface Marker {
  readonly schema_version: 1;
  readonly name: string;
  /**
   * Agent names that own this install (§7.2 path sharing).
   * Non-empty; alphabetically sorted. When N agents resolve to the
   * same `dest`, all N names are recorded here so `crew uninstall
   * --agent X` can remove X's ownership without deleting bytes that
   * other agents still need.
   */
  readonly agents: readonly string[];
  /** Tap that owned this skill at install time. May not exist in current config. */
  readonly tap_name: string;
  /** `git` (URL-backed clone) or `path` (local directory). */
  readonly tap_kind: TapKind;
  /** Clone URL for git taps; empty for path taps. */
  readonly tap_url: string;
  /** Subpath inside the git tap's repo; empty for none. */
  readonly tap_subpath: string;
  /** Absolute path to the path-kind tap's directory; empty for git taps. */
  readonly tap_path: string;
  /** Skill location relative to the tap's root. Empty when the tap is one skill. */
  readonly path: string;
  readonly ref: string | null;
  readonly resolved_sha: string | null;
  readonly content_hash: string;
  readonly scope: Scope;
  readonly installed_at: string;
  readonly installed_by: string;
}

// -----------------------------------------------------------------------------
// state.json
//
// Per-entry `source` is just `{ tap, path }` — the URL or filesystem path
// is held on the tap row in `config.yaml`. Renaming a tap or changing its
// URL doesn't require rewriting state.
// -----------------------------------------------------------------------------

/**
 * Where an installed skill came from, in state. References its owning tap by
 * name; resolve via the `Config` to get URL/path/subpath.
 */
export interface StateSource {
  /** Name of a tap currently in `config.yaml`. */
  readonly tap: string;
  /** Skill location relative to the tap's root. */
  readonly path: string;
}

/** An entry in state.json per §11.1. */
export interface StateEntry {
  readonly name: string;
  readonly source: StateSource;
  readonly ref: string | null;
  readonly resolved_sha: string | null;
  readonly content_hash: string;
  readonly scope: Scope;
  readonly installed_at: string;
  readonly agents: readonly string[];
  readonly pinned: boolean;
  /** True if the user asked for this skill by name. False for dep-only installs. */
  readonly explicit: boolean;
  /** Names of installed skills at this scope that depend on this one. */
  readonly required_by: readonly string[];
  /**
   * True when this entry came from a whole-tap install (`crew install
   * <tap-url>` / `crew install <tap-name>`) and should be re-expanded
   * by `crew update` — if the tap gains new skills upstream, they
   * install automatically. False (or absent) when the user installed
   * the skill individually; those don't pull in siblings on update.
   */
  readonly tracks_tap?: boolean;
  /**
   * For `scope === "project"` entries: the absolute directory the skill
   * was installed from. Used by update/uninstall/doctor so these
   * operations work correctly regardless of the user's current cwd.
   * Absent on user-scope entries.
   */
  readonly project_root?: string;
}

/** The state.json file on disk. */
export interface StateFile {
  readonly schema_version: 1;
  readonly installations: readonly StateEntry[];
}

// -----------------------------------------------------------------------------
// Tap config
//
// `kind` discriminates how the tap's contents get on disk:
//   - `git`  → clone of `url` (optional `subpath` rooted inside the repo)
//   - `path` → local directory at `path`
//
// `registered` distinguishes user-managed taps from auto taps that crew
// created during install. Auto taps are GC'd when their last skill is
// uninstalled; registered taps stick around.
// -----------------------------------------------------------------------------

export type TapKind = "git" | "path";

/** A tap configured in config.yaml. */
export interface TapConfig {
  readonly name: string;
  readonly kind: TapKind;
  /** True for user-added taps (`crew tap add`). False for crew-created auto taps. */
  readonly registered: boolean;
  /** For `kind: "git"`: the clone URL. Empty for `kind: "path"`. */
  readonly url: string;
  /** For `kind: "git"`: optional subpath inside the repo. Empty for none / for path taps. */
  readonly subpath: string;
  /** For `kind: "path"`: absolute filesystem path to the tap directory. Empty for git taps. */
  readonly path: string;
}

/** The parsed, normalized config.yaml. */
export interface Config {
  readonly taps: readonly TapConfig[];
  readonly disabled_agents: readonly string[];
  readonly forced_agents: readonly string[];
  readonly autoupdate: {
    readonly enabled: boolean;
    readonly interval_seconds: number;
  };
}

// -----------------------------------------------------------------------------
// Install pipeline
// -----------------------------------------------------------------------------

/** A resolved skill ready to be installed: materialized contents and identity. */
export interface ResolvedSkill {
  /** Absolute path to the content in the store. */
  readonly storePath: string;
  /** The frontmatter name. */
  readonly name: string;
  /** Loaded frontmatter for dependency walking. */
  readonly frontmatter: SkillFrontmatter;
  /** Tap that owns this skill (the marker carries the full tap descriptor). */
  readonly tap: TapConfig;
  /** Skill location relative to the tap's root. */
  readonly tapRelativePath: string;
  /** The ref the user asked for. */
  readonly ref: string | null;
  /** Full 40-char SHA, or null for path-kind taps. */
  readonly resolvedSha: string | null;
  /** Whether the install counts as pinned (SHA or tag). */
  readonly pinned: boolean;
  /** Content hash of the store entry. */
  readonly contentHash: string;
  /**
   * True if this skill was named on the command line (or via a tap-name
   * install). False if it's here only as a transitive dependency.
   */
  readonly explicit: boolean;
  /**
   * True when this skill came from a whole-tap install (the user
   * asked for the whole tap, not a single skill). Propagates to the
   * state entry's `tracks_tap` so `crew update` knows whether to
   * re-expand new siblings automatically.
   */
  readonly tracksTap: boolean;
}
