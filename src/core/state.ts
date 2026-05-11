/**
 * State-file types for `~/.crew/state.json` (§11.1).
 */

import type { Scope } from "./scope.ts";

/**
 * Where an installed skill came from, in state. References its owning tap by
 * name; resolve via config to get URL/path/subpath.
 */
export interface StateSource {
  /** Name of a tap currently in `config.yaml`. */
  readonly tap: string;
  /** Skill location relative to the tap's root. */
  readonly path: string;
}

/** An entry in state.json. */
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
  /** True when this entry came from a whole-tap install and should be re-expanded. */
  readonly tracks_tap?: boolean;
  /** For `scope === "project"` entries: the absolute install project root. */
  readonly project_root?: string;
}

/** The state.json file on disk. */
export interface StateFile {
  readonly schema_version: 1;
  readonly installations: readonly StateEntry[];
}
