/** Raw inventory problems retain path identity until logical projection and safe rendering (§11.2). */
import { redactText, sanitizeLine } from "../../../util/redact.ts";
import type { Finding, FindingCode } from "../findings/index.ts";

export interface InventoryProblem {
  readonly code: Extract<FindingCode, "marker_invalid" | "marker_unreadable">;
  readonly path: string;
  readonly detail: string;
}

/** Preserve one sanitized, redacted marker-invalid finding per marker path. */
export function invalidMarkerFinding(path: string, detail: string): [string, Finding] {
  return inventoryProblemFinding(invalidMarkerProblem(path, detail));
}

/** Keep physical scan facts unformatted until every lexical observation has been projected. */
export function invalidMarkerProblem(path: string, detail: string): InventoryProblem {
  return { code: "marker_invalid", path, detail };
}

/** The filesystem diagnostic belongs to the failed operation, before output escaping. */
export function unreadableInventoryProblem(path: string, err: unknown): InventoryProblem {
  return { code: "marker_unreadable", path, detail: (err as Error).message };
}

/** Install leaves and marker entries cannot borrow authority through symbolic links (§11.2). */
export function linkedInventoryProblem(path: string): InventoryProblem {
  return invalidMarkerProblem(
    path,
    "symbolic link is invalid inventory; replace it with the managed entry before repair",
  );
}

/** Alias diagnostics keep the logical path both in their key and native filesystem detail. */
export function inventoryProblemFinding(
  problem: InventoryProblem,
  path = problem.path,
): [string, Finding] {
  const detail = problem.detail.split(problem.path).join(path);
  return [
    `${problem.code}\0${path}`,
    {
      level: "error",
      code: problem.code,
      message: sanitizeLine(redactText(`${path}: ${detail}`)),
    },
  ];
}
