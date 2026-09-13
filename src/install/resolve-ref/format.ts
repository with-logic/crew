/**
 * Rendering helpers for ambiguity errors (§8.3, §13).
 *
 * Every candidate is turned into a ready-to-paste `crew install ...`
 * command so the user can see exactly how to resolve the collision.
 */

import { safePath } from "../../util/redact.ts";
import type { NameCandidate } from "../attribute-bare-name.ts";

/**
 * Render a ready-to-paste install command for a candidate.
 *
 * Tap, namespace, and skill names come from configured taps and from the
 * user's argv, so they are untrusted here. They are escaped as they are
 * interpolated — not after the caller has joined lines — because once a
 * newline is inside the composed message it is indistinguishable from the
 * layout breaks `ambiguityError` adds deliberately (§5.2).
 */
export function formatCandidate(c: NameCandidate, bareName: string): string {
  const name = safePath(bareName);
  if (c.kind === "tap") {
    const tap = safePath(c.tap.name);
    return `crew install --tap ${tap}    # install every skill in the \`${tap}\` tap`;
  }
  if (c.kind === "namespace") {
    const tap = safePath(c.tap.name);
    const ns = safePath(c.namespace);
    return `crew install ${tap}/${ns}    # ${c.members.length} skill${c.members.length === 1 ? "" : "s"} in namespace \`${ns}\``;
  }
  const tapName = safePath(c.tap.name);
  const ns = c.location.namespace === null ? null : safePath(c.location.namespace);
  if (ns !== null) {
    return `crew install ${tapName}/${ns}/${name}    # the skill \`${name}\` in namespace \`${ns}\``;
  }
  return `crew install ${tapName}/${name}    # the skill \`${name}\` in tap \`${tapName}\``;
}

/** A short one-line label for the prompt ("the `foo` tap", etc.) */
export function shortLabelFor(c: NameCandidate, bareName: string): string {
  if (c.kind === "tap") return `install the \`${c.tap.name}\` tap`;
  if (c.kind === "namespace")
    return `install the \`${c.namespace}\` namespace from \`${c.tap.name}\` (${c.members.length} skill${c.members.length === 1 ? "" : "s"})`;
  const tapName = c.tap.name;
  const ns = c.location.namespace;
  if (ns !== null) return `install skill \`${bareName}\` from \`${tapName}\`/\`${ns}\``;
  return `install skill \`${bareName}\` from \`${tapName}\``;
}
