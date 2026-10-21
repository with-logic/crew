/** Construct path-keyed invalid-marker diagnostics consistently for doctor (§11.2). */
import { redactText, sanitizeLine } from "../../../util/redact.ts";
import type { Finding } from "../checks.ts";

/** Preserve one sanitized, redacted marker-invalid finding per marker path. */
export function invalidMarkerFinding(path: string, detail: string): [string, Finding] {
  return [
    `marker_invalid\0${path}`,
    {
      level: "error",
      code: "marker_invalid",
      message: sanitizeLine(redactText(`${path}: ${detail}`)),
    },
  ];
}
