/**
 * The one-line form of a failure reported on stderr under `--quiet`
 * (§5.2), shared by the commands that report failures there.
 */

import { withRemedy } from "../util/error-remedy.ts";
import { sanitizeLine } from "../util/redact.ts";

/** One quiet diagnostic: who failed, the error code, and the full message, with controls escaped. */
export function failureLine(
  subject: string,
  code: string,
  message: string,
  remedy?: string,
): string {
  return sanitizeLine(withRemedy(`${subject}: failed (${code}): ${message}`, { remedy }));
}
