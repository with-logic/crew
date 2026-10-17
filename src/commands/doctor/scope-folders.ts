/**
 * The skills folders each scope's walk reads, per adapter (§11.2 check 9).
 *
 * One folder can serve both scopes: a project root at the user's home puts
 * its project folder where the user folder is. A marker one scope's walk
 * finds there that records the other scope is the other walk's to check,
 * so it is no finding — only one in a folder its own scope's walk never
 * reads is.
 */

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { type AgentAdapter, baseFor } from "../../agents/adapter.ts";
import { SCOPES } from "../../core/scope.ts";
import type { Scope } from "../../core/types.ts";

/** Where each scope's walk reads `adapter`'s installs, each as one place. */
export type ScopeFolders = Readonly<Record<Scope, ReadonlySet<string>>>;

/** `adapter`'s user folder, and its project folder at each of `roots`. */
export function scopeFolders(
  adapter: AgentAdapter,
  cwd: string,
  roots: readonly string[],
): ScopeFolders {
  const user = new Set<string>();
  const project = new Set<string>();
  const userBase = baseFor(adapter, "user", cwd);
  if (userBase !== "") user.add(place(userBase));
  for (const root of roots) {
    const base = baseFor(adapter, "project", root);
    if (base !== "") project.add(place(base));
  }
  return { user, project };
}

/** The scopes whose walk reads `base`. */
export function scopesReading(folders: ScopeFolders, base: string): ReadonlySet<Scope> {
  const at = place(base);
  const scopes = new Set<Scope>();
  for (const scope of SCOPES) if (folders[scope].has(at)) scopes.add(scope);
  return scopes;
}

/**
 * `path` as one place, however it is spelled (`/var` or `/private/var`, a
 * linked home): its real path, or — where nothing crew can resolve is
 * there — the path resolved as written.
 */
function place(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}
