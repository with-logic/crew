/**
 * Tap breadth comparison for re-attribution (§5.4, §16.5).
 *
 * Two tap rows can point at the same repository from different depths:
 * one at the repo root, one at `skills/docx`. Re-attribution may move an
 * entry between them, but never from the wider row to the narrower one —
 * the wider row is what `crew update` re-walks to discover siblings
 * (§10.1.1), and it is garbage-collected once its last entry leaves.
 */

import type { TapConfig } from "../core/types.ts";
import { canonicalRepoUrl } from "./source-identity.ts";

/**
 * True when `incoming` is rooted strictly deeper in the same repository
 * than `existing` — it would see fewer siblings on re-expansion.
 * Different repositories never narrow each other, and identical roots
 * don't either.
 *
 * Named for its direction: the subject is `incoming`, and the question
 * is whether moving an entry onto it would lose breadth.
 */
export function isTapRootNarrowerThan(incoming: TapConfig, existing: TapConfig): boolean {
  if (existing.kind !== incoming.kind) return false;
  if (existing.kind === "path") return isStrictlyDeeper(existing.path, incoming.path);
  if (canonicalRepoUrl(existing.url) !== canonicalRepoUrl(incoming.url)) return false;
  return isStrictlyDeeper(existing.subpath, incoming.subpath);
}

/** True when `inner` is a strict sub-location of `outer`. */
function isStrictlyDeeper(outer: string, inner: string): boolean {
  const o = trimBothSlashes(outer);
  const i = trimBothSlashes(inner);
  if (i === o) return false;
  return o.length === 0 ? i.length > 0 : i.startsWith(`${o}/`);
}

function trimBothSlashes(s: string): string {
  return s.replace(/^\/+/, "").replace(/\/+$/, "");
}
