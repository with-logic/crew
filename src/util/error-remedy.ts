/** Preserve explicit aggregate hints without generic defaults (§10.1, §13, §16.6). */

import { displayText } from "../refs/display-url.ts";
import { sanitizeLine } from "./redact.ts";

interface RemedyHint {
  readonly remedy?: string | null | undefined;
}

/** New machine-visible hints are diagnostics; the original error stays untouched. */
export function explicitRemedy(error: RemedyHint): { readonly remedy?: string } {
  return error.remedy ? { remedy: sanitizeLine(displayText(error.remedy)) } : {};
}

/** Compose before the caller applies whole-diagnostic escaping and redaction. */
export function withRemedy(message: string, error: RemedyHint): string {
  return error.remedy ? `${message}; next step: ${error.remedy}` : message;
}
