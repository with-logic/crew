/**
 * SHA validation helpers for known-tap registry builds (§16.2.1).
 */

const SHA_PATTERN = /^[0-9a-f]{40}$/;

export function isFullSha(value: string): boolean {
  return SHA_PATTERN.test(value);
}
