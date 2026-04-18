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

import type { Marker, Scope } from "../core/types.ts";

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
