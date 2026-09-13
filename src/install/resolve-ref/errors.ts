/**
 * Error rendering helpers for tap-reference resolution (§8.3, §13).
 */

import { CrewError } from "../../core/errors.ts";
import { safePath } from "../../util/redact.ts";
import type { NameCandidate } from "../attribute-bare-name.ts";
import { formatCandidate } from "./format.ts";

/** Convert a resolver kind hint into its CLI flag spelling. */
export function flagFor(k: "tap" | "namespace" | "skill"): string {
  if (k === "tap") return "tap";
  if (k === "namespace") return "bundle";
  return "skill";
}

/**
 * Build the shared ambiguity error for tap, namespace, and skill collisions.
 *
 * `name` and `reason` carry user- and config-controlled text, so they are
 * escaped here, as the lines are composed. `formatCandidate` escapes its own
 * fragments for the same reason. Only once every fragment is safe are the
 * remaining "\n" breaks guaranteed to be layout, which is what lets this
 * error pass `multiline: true` without letting data forge a line (§5.2).
 */
export function ambiguityError(
  name: string,
  candidates: readonly NameCandidate[],
  reason?: string,
): CrewError {
  const safeName = safePath(name);
  const lines: string[] = [];
  lines.push(
    reason === undefined
      ? `\`${safeName}\` is ambiguous across taps, skills, and namespaces`
      : safePath(reason),
  );
  lines.push("");
  lines.push("  Rerun with one of:");
  lines.push("");
  for (const c of candidates) {
    lines.push(`    ${formatCandidate(c, name)}`);
  }
  lines.push("");
  const detail = candidates.map((c) => formatCandidate(c, name));
  return new CrewError(
    "ambiguous_reference",
    lines.join("\n"),
    { name, candidates: detail },
    undefined,
    true,
  );
}
