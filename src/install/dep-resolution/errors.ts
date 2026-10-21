/** Ambiguous sibling dependency diagnostics (§9 step 6). */

import { CrewError } from "../../core/errors.ts";

export function duplicateSiblingError(
  depName: string,
  tapName: string,
  matches: readonly { dirName: string }[],
): CrewError {
  const paths = matches.map((m) => m.dirName).join(", ");
  return new CrewError(
    "conflicting_dependencies",
    `dependency \`${depName}\` appears multiple times near tap \`${tapName}\` at ${paths}`,
    { name: depName, tap: tapName, paths: matches.map((m) => m.dirName) },
  );
}
