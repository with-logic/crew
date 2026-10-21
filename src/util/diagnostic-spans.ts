/** Monotonic unstructured diagnostic boundaries; ambiguous credential suffixes fail closed (§5.2, §13). */

interface SchemeSpan {
  readonly start: number;
  readonly authorityStart: number;
}

/** Keys are parsed once; no delimiter in a credential value can release its suffix (§13). */
function queryBoundary(text: string, displayableParams: ReadonlySet<string>): number | undefined {
  let keyStart = -1;
  let readingKey = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if ((ch === "?" && !readingKey) || (ch === "&" && keyStart >= 0)) {
      keyStart = i + 1;
      readingKey = true;
    } else if (ch === "=" && readingKey) {
      // URLSearchParams strips one leading '?'; supply our own so the raw key survives (§13).
      const key = new URLSearchParams(`?${text.slice(keyStart, i)}=`).keys().next().value!;
      if (!displayableParams.has(key.toLowerCase())) return i + 1;
      readingKey = false;
    }
  }
  return undefined;
}

function schemeSpans(text: string): SchemeSpan[] {
  const spans: SchemeSpan[] = [];
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (/[a-z0-9+.-]/i.test(ch)) {
      if (start < 0 && /[a-z]/i.test(ch)) start = i;
      continue;
    }
    if (start >= 0 && text.startsWith("://", i)) {
      spans.push({ start, authorityStart: i + 3 });
      i += 2;
    }
    start = -1;
  }
  return spans;
}

/** Render only unambiguous URL spans; all scans/slices cover disjoint bounded ranges. */
export function redactDiagnostic(
  text: string,
  renderUrl: (value: string) => string,
  displayableParams: ReadonlySet<string>,
): string {
  const boundary = queryBoundary(text, displayableParams);
  const visible = text.slice(0, boundary ?? text.length);
  const spans = schemeSpans(visible);
  const parts: string[] = [];
  let cursor = 0;
  for (let index = 0; index < spans.length; index++) {
    const span = spans[index]!;
    let authorityEnd = span.authorityStart;
    while (authorityEnd < visible.length && !"/?#".includes(visible[authorityEnd]!)) {
      // Backslashes include CrewError-escaped controls and WHATWG slash normalization (§13).
      const ch = visible[authorityEnd]!;
      const code = ch.charCodeAt(0);
      const ambiguous = /[\s'"<>`\\]/.test(ch) || code < 0x20 || (code >= 0x7f && code <= 0x9f);
      if (ambiguous) return `${parts.join("")}${visible.slice(cursor, span.start)}***`;
      authorityEnd++;
    }
    let tokenEnd = authorityEnd;
    while (tokenEnd < visible.length && visible[tokenEnd] !== " ") tokenEnd++;
    const next = spans[index + 1];
    if (next !== undefined && next.start < tokenEnd)
      return `${parts.join("")}${visible.slice(cursor, span.start)}***`;
    let bodyEnd = authorityEnd;
    while (bodyEnd < tokenEnd && !/[\s'"<>`?#]/.test(visible[bodyEnd]!)) bodyEnd++;
    let trimmedEnd = bodyEnd;
    if (visible[authorityEnd] === "/") {
      while (trimmedEnd > authorityEnd && /['"<>`.,;:)\]]/.test(visible[trimmedEnd - 1]!))
        trimmedEnd--;
    }
    const rendered = renderUrl(visible.slice(span.start, trimmedEnd));
    if (rendered === "***") return `${parts.join("")}${visible.slice(cursor, span.start)}***`;
    parts.push(visible.slice(cursor, span.start), rendered, visible.slice(trimmedEnd, bodyEnd));
    cursor = bodyEnd;
  }
  parts.push(visible.slice(cursor), boundary === undefined ? "" : "***");
  return parts.join("");
}
