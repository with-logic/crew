/**
 * Safe display rendering for source URLs, diagnostics, and error details
 * (§8.2, §13, §16.3). The shared progress redactor masks unknown query
 * values and fails closed on malformed URLs; diagnostics also cover bare
 * query tails git emits after stripping a file:// scheme.
 */

import { firstMalformedHttpStart } from "../util/malformed-http/index.ts";
import { redactDetails, redactText, safeUrl, sanitizeBlock } from "../util/redact.ts";

/** References hide all userinfo; progress separately preserves SSH usernames. */
export function displayUrl(raw: string): string {
  // WHATWG normalization can turn a visible escaped control into a host/path (§13).
  if (firstMalformedHttpStart(raw, true) !== undefined) return "***";
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
