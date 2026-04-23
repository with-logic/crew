/**
 * Rendering helpers for ambiguity errors (§8.3, §13).
 *
 * Every candidate is turned into a ready-to-paste `crew install ...`
 * command so the user can see exactly how to resolve the collision.
 */

import type { NameCandidate } from "../attribute-bare-name.ts";

/** Render a ready-to-paste install command for a candidate. */
export function formatCandidate(c: NameCandidate, bareName: string): string {
  if (c.kind === "tap") {
    return `crew install --tap ${c.tap.name}    # install every skill in the \`${c.tap.name}\` tap`;
  }
  if (c.kind === "namespace") {
    return `crew install ${c.tap.name}/${c.namespace}    # ${c.members.length} skill${c.members.length === 1 ? "" : "s"} in namespace \`${c.namespace}\``;
  }
  const tapName = c.tap.name;
  const ns = c.location.namespace;
  if (ns !== null) {
    return `crew install ${tapName}/${ns}/${bareName}    # the skill \`${bareName}\` in namespace \`${ns}\``;
  }
  return `crew install ${tapName}/${bareName}    # the skill \`${bareName}\` in tap \`${tapName}\``;
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
