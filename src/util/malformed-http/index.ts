/** Monotonic malformed HTTP(S) diagnostic detection without changing reference grammar (§5.2, §13). */

import { controlUnitLength, skipHttpGap } from "./units.ts";

interface HttpOpener {
  readonly afterColon: number;
  readonly altered: boolean;
}

function httpOpener(text: string, start: number): HttpOpener | undefined {
  let index = start;
  for (const expected of "http") {
    index = skipHttpGap(text, index, true);
    if (text[index]?.toLowerCase() !== expected) return undefined;
    index++;
  }
  index = skipHttpGap(text, index, true);
  if (text[index]?.toLowerCase() === "s") index++;
  index = skipHttpGap(text, index);
  if (text[index] !== ":") return undefined;
  return { afterColon: index + 1, altered: !/^https?:$/i.test(text.slice(start, index + 1)) };
}

function malformedSeparators(text: string, opener: HttpOpener): boolean {
  let index = skipHttpGap(text, opener.afterColon);
  if (text[index] !== "/" && text[index] !== "\\") return false;
  let slashes = 0;
  let altered = opener.altered || index !== opener.afterColon;
  while (index < text.length) {
    const gapEnd = skipHttpGap(text, index);
    if (gapEnd !== index) {
      altered = true;
      index = gapEnd;
    }
    if (text[index] === "/") slashes++;
    else if (text[index] === "\\") altered = true;
    else break;
    index++;
  }
  return altered || slashes < 2;
}

/**
 * Scheme matching and authority tracking advance independently, so an older
 * `HTTP:` label cannot consume the letters of a later malformed opener (§13).
 * Failed fixed-length matches and opening gaps have bounded overlapping scans;
 * unresolved zero-separator authorities share one earliest candidate, never suffix rescans.
 */
export function firstMalformedHttpStart(text: string, wholeToken = false): number | undefined {
  let authorityStart: number | undefined;
  let previousWasSchemeCharacter = false;
  const wholeStart = skipHttpGap(text, 0);
  for (let index = 0; index < text.length; index++) {
    const controlLength = controlUnitLength(text, index);
    if (controlLength > 0) {
      previousWasSchemeCharacter = false;
      index += controlLength - 1;
      continue;
    }
    const ch = text[index]!;
    const beginsScheme = ch.toLowerCase() === "h" && !previousWasSchemeCharacter;
    previousWasSchemeCharacter = /[a-z\d+.-]/i.test(ch);
    if (beginsScheme && (!wholeToken || index === wholeStart)) {
      const opener = httpOpener(text, index);
      if (opener !== undefined) {
        if (malformedSeparators(text, opener)) return index;
        // Valid whole URLs have a trusted boundary; their path is not another URL (§13).
        if (wholeToken && text.startsWith("//", opener.afterColon)) return undefined;
        authorityStart ??= index;
        previousWasSchemeCharacter = false;
        index = opener.afterColon - 1;
        continue;
      }
    }
    if (ch === "@" && authorityStart !== undefined) return authorityStart;
    if ("/\\?#".includes(ch)) authorityStart = undefined;
  }
  return undefined;
}
