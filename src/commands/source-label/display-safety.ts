/**
 * Making a recorded URL or path safe to print (§5.1, §13).
 *
 * A source label is assembled from `config.yaml` and `state.json`, both
 * of which can hold values crew never validated — a clone URL carrying a
 * token, a subpath written before the parser rejected control characters.
 * These two helpers are the point where such a value stops being data and
 * becomes terminal output, so they are deliberately separate from the
 * label-assembly rules in `./index.ts`.
 */

/**
 * Render a URL for display. The result identifies the remote; it is not
 * a URL to clone with, because any credential it carried is gone.
 *
 * For a scheme URL (`https://`, `ssh://`, `file://`) the whole userinfo
 * component is replaced with `***`. Masking only a password would miss
 * the commonest shape of all: a personal access token is usually the
 * *username* with no password at all, as in
 * `https://ghp_xxx@github.com/acme/skills.git`.
 *
 * An SCP-style remote (`git@github.com:acme/skills.git`) keeps its user,
 * because there it is the protocol's fixed account rather than a secret,
 * and dropping it would name a remote that does not resolve.
 *
 * Query strings and fragments are dropped: they are never part of a
 * clone URL crew recorded, and are a common place to smuggle a token.
 */
export function displayUrl(url: string): string {
  const schemeIdx = url.indexOf("://");
  if (schemeIdx < 0) return url; // SCP-style `user@host:path`; see above.
  const scheme = url.slice(0, schemeIdx + 3);
  let rest = url.slice(schemeIdx + 3);
  const cut = firstIndexOf(rest, ["?", "#"]);
  if (cut >= 0) rest = rest.slice(0, cut);
  return `${scheme}${maskUserinfo(rest)}`;
}

/**
 * Escape anything that could move a terminal cursor or forge output.
 * Subpaths come from `config.yaml` and `state.json`, which may predate
 * the parser guard, so rendering escapes rather than trusting the input.
 *
 * Both control ranges are escaped, not just C0: a terminal in 8-bit mode
 * reads C1 codepoints as their escape-sequence equivalents, so U+009B is
 * a control sequence introducer exactly as `ESC [` is.
 */
export function safeLabel(label: string): string {
  let out = "";
  for (const ch of label) {
    const code = ch.codePointAt(0)!;
    out += isControl(code) ? `\\x${code.toString(16).padStart(2, "0")}` : ch;
  }
  return out;
}

/**
 * Replace a scheme URL's entire userinfo: `anything@host` → `***@host`.
 * Both halves are treated as secret — see `displayUrl`.
 */
function maskUserinfo(authorityAndPath: string): string {
  const slashIdx = authorityAndPath.indexOf("/");
  const authorityEnd = slashIdx < 0 ? authorityAndPath.length : slashIdx;
  const atIdx = authorityAndPath.lastIndexOf("@", authorityEnd);
  if (atIdx < 0) return authorityAndPath;
  return `***${authorityAndPath.slice(atIdx)}`;
}

function firstIndexOf(s: string, needles: readonly string[]): number {
  let best = -1;
  for (const n of needles) {
    const i = s.indexOf(n);
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  return best;
}

/** C0 (`0x00`–`0x1f`), DEL (`0x7f`), and C1 (`0x80`–`0x9f`). */
function isControl(code: number): boolean {
  return code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f);
}
