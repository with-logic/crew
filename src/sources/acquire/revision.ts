/** Git revision acquisition and optional command-local prepared outcomes (§9, §10.1, §14). */
import { tapClonePath } from "../../core/repo-path.ts";
import type { TapConfig } from "../../core/types.ts";
import { ensureClone } from "../../git/repo/index.ts";
import { classifyRef, resolveRef } from "../../git/repo/refs.ts";
import { migrateTapClone } from "../migrate-clones.ts";
import { resolveRefFetchingIfNeeded } from "./resolve-ref.ts";

export interface GitRevision {
  readonly clonePath: string;
  readonly resolvedSha: string;
  readonly pinned: boolean;
}
export interface PreparedSources {
  readonly revisionFor: (tap: TapConfig, ref: string | null) => GitRevision;
}

export function revisionKey(tap: TapConfig, ref: string | null): string {
  return JSON.stringify([tap.name, ref]);
}

/** Ordinary callers retain clone-on-missing and ref-fetch fallback. */
export function acquireGitRevision(
  tap: TapConfig,
  ref: string | null,
  home: string,
  prepared?: PreparedSources,
): GitRevision {
  if (prepared) return prepared.revisionFor(tap, ref);
  migrateTapClone(tap, home);
  const clonePath = tapClonePath(tap, home);
  ensureClone(tap.url, clonePath);
  if (ref === null) return { clonePath, resolvedSha: resolveRef(clonePath, "@"), pinned: false };
  const resolvedSha = resolveRefFetchingIfNeeded(clonePath, ref);
  const kind = classifyRef(clonePath, ref);
  return { clonePath, resolvedSha, pinned: kind === "sha" || kind === "tag" };
}
