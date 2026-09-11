/**
 * Safe display rendering for URLs that appear in user-facing errors (§13).
 *
 * A git URL may legitimately carry credentials — `https://user:token@host/o/r`
 * clones a private repo — so crew keeps the userinfo for acquisition. It must
 * never reach a terminal or a captured `--json` payload, where it would be
 * published to scrollback and CI logs.
 *
 * `displayUrl` is the rendering counterpart: it strips userinfo, redacts the
 * value of credential-bearing query parameters, and escapes control characters
 * so a crafted URL cannot forge output or move the cursor.
 *
 * NOTE for whoever merges this with PR #108 (`feat/verbose-flag`): that branch
 * adds `src/util/redact.ts` doing the same job for verbose progress lines.
 * These two should collapse onto one shared renderer — this file is the
 * minimum #113 needs and deliberately does not duplicate the wider surface.
 */

/** Query parameters whose values are redacted rather than shown. */
const SENSITIVE_PARAMS: ReadonlySet<string> = new Set([
  "access_token",
  "api_key",
  "apikey",
  "auth",
  "key",
  "password",
  "private_token",
  "secret",
  "token",
]);

/** Replaces a redacted secret so the shape stays legible. */
const MASK = "***";

/**
 * C0 and C1 control characters, which must never reach a terminal raw.
 * Kept as a literal so Biome's useRegexLiterals rule is satisfied.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point — they are escaped, never emitted.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

/**
 * Userinfo in a string `new URL` refused to parse. A malformed URL is exactly
 * the case that reaches an error message, so it still has to be scrubbed.
 */
const RAW_USERINFO = /^([a-z][a-z0-9+.-]*:\/\/)[^/@\s]*@/i;

/**
 * Render `raw` for human or JSON output with credentials removed.
 *
 * Strings `new URL` cannot parse still get a textual userinfo scrub and the
 * control-character pass, so a malformed URL cannot leak a token either.
 */
export function displayUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return escapeControls(raw.replace(RAW_USERINFO, `$1${MASK}@`));
  }
  if (url.username || url.password) {
    url.username = MASK;
    url.password = "";
  }
  for (const name of url.searchParams.keys()) {
    if (SENSITIVE_PARAMS.has(name.toLowerCase())) {
      url.searchParams.set(name, MASK);
    }
  }
  // `URL` percent-encodes control characters in every component it parses,
  // but the pass is cheap and keeps one guarantee for both return paths.
  return escapeControls(url.toString());
}

/** Replace C0/C1 control characters with a visible escape. */
function escapeControls(value: string): string {
  return value.replace(CONTROL_CHARS, (ch) => {
    const code = ch.codePointAt(0)!;
    return `\\x${code.toString(16).padStart(2, "0")}`;
  });
}
