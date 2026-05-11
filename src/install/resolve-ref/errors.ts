/**
 * Error rendering helpers for tap-reference resolution (§8.3, §13).
 */

import { CrewError } from "../../core/errors.ts";
import type { NameCandidate } from "../attribute-bare-name.ts";
import { formatCandidate } from "./format.ts";

/** Convert a resolver kind hint into its CLI flag spelling. */
export function flagFor(k: "tap" | "namespace" | "skill"): string {
  if (k === "tap") return "tap";
  if (k === "namespace") return "bundle";
  return "skill";
}

/** Build the shared ambiguity error for tap, namespace, and skill collisions. */
export function ambiguityError(
  name: string,
  candidates: readonly NameCandidate[],
  reason?: string,
): CrewError {
  const lines: string[] = [];
  lines.push(reason ?? `\`${name}\` is ambiguous across taps, skills, and namespaces`);
  lines.push("");
  lines.push("  Rerun with one of:");
  lines.push("");
  for (const c of candidates) {
    lines.push(`    ${formatCandidate(c, name)}`);
  }
  lines.push("");
  const detail = candidates.map((c) => formatCandidate(c, name));
  return new CrewError("ambiguous_reference", lines.join("\n"), {
    name,
    candidates: detail,
  });
}
