/**
 * Safe display rendering for source URLs, diagnostics, and error details
 * (§8.2, §13, §16.3). The shared progress redactor masks unknown query
 * values and fails closed on malformed URLs; diagnostics also cover bare
 * query tails git emits after stripping a file:// scheme.
 */

import { redactDetails, redactText, safeUrl, sanitizeBlock } from "../util/redact.ts";

/** References hide all userinfo; progress separately preserves SSH usernames. */
export function displayUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.username || url.password) {
      url.username = "***";
      url.password = "";
    }
    return safeUrl(url.toString());
  } catch {
    return safeUrl(raw);
  }
}

/** Keep diagnostic line breaks, escaping every other terminal control. */
export function displayText(text: string): string {
  return sanitizeBlock(redactText(text, displayUrl));
}

/** Preserve machine-contract keys while redacting their string values. */
export function displayDetails(
  details: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return redactDetails(details, displayText);
}
