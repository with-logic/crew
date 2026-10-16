/**
 * Enqueue the items produced by a single root reference (§9 steps 1–5).
 *
 * A root is what the user typed. Tap-shaped references delegate to
 * `enqueueTapRef`; a git URL or path is a whole-tap install, because
 * pointing at a repository or folder means "install what is here", and
 * §10.1.1 then keeps that set current. A gist's `//<file>` is the one
 * narrower git form (§8.2); `enqueueSourceRef` handles both.
 */

import type { Config, ResolvedSkill, TapConfig } from "../../core/types.ts";
import { parseRef } from "../../refs/parse.ts";
import type { SkippedSkill } from "../../sources/expand.ts";
import type { KindHint } from "../resolve-ref/index.ts";
import { enqueueTapRef, type PendingItem } from "./enqueue.ts";
import { enqueueSourceRef } from "./source-ref.ts";

/** Resolve and enqueue the items produced by a single root reference. */
export function enqueueRoot(
  raw: string,
  config: Config,
  cwd: string,
  home: string,
  kindHint: KindHint,
  recursive: boolean,
  requireTap: (tap: TapConfig) => void,
): { items: PendingItem[]; config: Config; skipped: readonly SkippedSkill[] } {
  const source = parseRef(raw, cwd);

  // Bare-name (`<skill>`) and qualified (`<tap>/<skill>`, `<tap>/<ns>/<skill>`) tap refs.
  if (source.type === "tap") {
    return enqueueTapRef(source, config, home, true, kindHint);
  }

  // Git URL or path: a whole-tap install — the user pointed at a folder
  // (or repo) and said "install this", so future additions should follow.
  return enqueueSourceRef(source, config, home, requireTap, {
    explicit: true,
    tracksTap: true,
    ...(recursive ? { discovery: "recursive" } : {}),
  });
}

/**
 * True when an already-resolved skill and a newly pending one name the
 * same source, so a duplicate reference can collapse instead of
 * conflicting. Path-kind taps have no resolved SHA, so tap name plus
 * tap-relative path is the identity that works for both kinds.
 */
export function sameInstallSetSource(existing: ResolvedSkill, incoming: PendingItem): boolean {
  return (
    existing.tap.name === incoming.tap.name && existing.tapRelativePath === incoming.tapRelativePath
  );
}

/** Human-readable source for conflict messages. */
export function sourceLabel(
  tapName: string,
  tapRelativePath: string,
  resolvedSha: string | null,
): string {
  if (tapRelativePath.length > 0) return `${tapName}/${tapRelativePath}`;
  return resolvedSha === null
    ? `${tapName} (root, local)`
    : `${tapName} (root @ ${resolvedSha.slice(0, 8)})`;
}
