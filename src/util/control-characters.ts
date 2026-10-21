/** Shared C0, DEL and C1 character-code classification for safe display (§5.2, §13). */

export function isControlCharacterCode(code: number): boolean {
  return code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f);
}
