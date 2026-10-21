/** Raw and CrewError-escaped control units in HTTP diagnostic openers (§5.2, §13). */

import { isControlCharacterCode } from "../control-characters.ts";

/** An escaped control is one display unit, not a URL path separator (§13). */
export function controlUnitLength(text: string, index: number): number {
  if (isControlCharacterCode(text.charCodeAt(index))) return 1;
  if (text[index] !== "\\" || text[index + 1] !== "x") return 0;
  const hex = text.slice(index + 2, index + 4);
  return /^[\da-f]{2}$/i.test(hex) && isControlCharacterCode(Number.parseInt(hex, 16)) ? 4 : 0;
}

/**
 * Skip raw/escaped controls and ordinary whitespace by default; `controlsOnly`
 * leaves ordinary whitespace in place while still treating escaped controls as units.
 */
export function skipHttpGap(text: string, start: number, controlsOnly = false): number {
  let index = start;
  while (index < text.length) {
    const length = controlUnitLength(text, index);
    if (length > 0) index += length;
    else if (!controlsOnly && /\s/.test(text[index]!)) index++;
    else break;
  }
  return index;
}
