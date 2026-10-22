/** Rejected-directory context for final reference misses (§8.3, §9, §13). */

import { CrewError } from "../../core/errors.ts";
import { displayText } from "../../refs/display-url.ts";
import { sanitizeLine } from "../../util/redact.ts";
import type { RejectedTapSkill } from "../tap-index.ts";

export interface RejectedReferenceSkill extends RejectedTapSkill {
  readonly tap: string;
  readonly namespace: string | null;
}

/** Preserve the existing miss contract, adding only safe diagnostic text. */
export function withRejectedManifests(
  error: CrewError,
  rejected: readonly RejectedReferenceSkill[],
): CrewError {
  if (rejected.length === 0) return error;
  const diagnostics = rejected.map((skill) =>
    sanitizeLine(
      displayText(
        `tap \`${skill.tap}\`, location \`${skill.path}\` (${skill.code}): ${skill.message}`,
      ),
    ),
  );
  return new CrewError(
    error.code,
    `${error.message} Rejected directory manifests: ${diagnostics.join("; ")}`,
    error.details,
    error.remedy,
  );
}
