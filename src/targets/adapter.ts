/**
 * The `TargetAdapter` interface (§7.1).
 *
 * Every agent coder crew installs into is handled through an adapter that
 * knows that tool's skill base directory. Adapters do not know anything
 * about crew's internals — they only implement the six operations below.
 *
 * The install and uninstall algorithms themselves (with their safety
 * checks) live in `./install.ts` and `./uninstall.ts` so every adapter
 * behaves identically; each adapter really only supplies the paths.
 */

import type { Marker, Scope, StateEntry } from "../core/types.ts";

/** Record returned by `list_installed`: marker plus installed dir. */
export interface InstalledSkillRecord {
  readonly adapter: string;
  readonly scope: Scope;
  readonly installDir: string;
  readonly marker: Marker;
}

/** The adapter contract. */
export interface TargetAdapter {
  /** Stable adapter name (lowercase, hyphens). */
  readonly name: string;
  /** True if this target is installed on the host. */
  detect(): boolean;
  /** Absolute user-scope base directory for skills. */
  userPath(): string;
  /** Absolute project-scope base directory for skills. */
  projectPath(cwd: string): string;
}

/** Resolve base dir given a scope. */
export function baseFor(adapter: TargetAdapter, scope: Scope, cwd: string): string {
  return scope === "user" ? adapter.userPath() : adapter.projectPath(cwd);
}

/**
 * Resolve the directory a state entry's install lives under. For
 * project-scope entries the authoritative location is the recorded
 * `project_root` — NOT whatever the user's shell is in at command
 * time. For user-scope entries the cwd is inert (the adapter's
 * `userPath()` ignores it), so we just pass `fallbackCwd` through.
 *
 * Every project-scope entry is required to carry a `project_root` —
 * it's set at install time and preserved on every upsert. If we ever
 * see one that's missing, that's a state corruption; we treat it the
 * same as `fallbackCwd` so `crew doctor` can still run and surface it
 * as a finding rather than crashing on a missing field.
 */
export function cwdForEntry(
  entry: Pick<StateEntry, "scope" | "project_root">,
  fallbackCwd: string,
): string {
  if (entry.scope === "user") return fallbackCwd;
  return entry.project_root ?? fallbackCwd;
}
