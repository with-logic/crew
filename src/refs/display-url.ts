/**
 * Safe display rendering for URLs that reach a user (§13, §16.3).
 *
 * A git URL may legitimately carry credentials — `https://user:token@host/o/r`
 * clones a private repo — so crew keeps the userinfo for acquisition and
 * stores it verbatim in `config.yaml`. It must never reach a terminal or a
 * captured `--json` payload, where it would be published to scrollback and CI
 * logs.
 *
 * Three shapes of leak need three entry points:
 *
 * - `displayUrl` renders a string that IS a URL: strips userinfo, redacts
 *   credential-bearing query parameters, escapes control characters.
 * - `displayText` scans free text for URL-shaped substrings. Git's stderr is
 *   prose with a remote embedded in it (`fatal: unable to access 'https://…'`),
 *   which a whole-string parse cannot see.
 * - `displayDetails` masks values in a `CrewError`'s structured payload. The
 *   JSON error shape is a stable machine contract (§13), so keys survive and
 *   only values are redacted.
 *
 * Control characters are escaped on every path: a crafted URL or tap name must
 * not be able to move the cursor, inject ANSI sequences, or forge an extra
 * output line.
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

/** A URL-shaped substring inside prose, stopping at whitespace or a quote. */
const URL_IN_TEXT = /\b[a-z][a-z0-9+.-]*:\/\/[^\s'"<>`]+/gi;

/**
 * A bare `?query` tail on a path, with no scheme in front of it.
 *
 * Git does not always echo the remote as crew supplied it: for a `file://`
 * URL it strips the scheme and reports the filesystem path alone
 * (`'/repo.git?token=…' does not appear to be a git repository`). The query
 * still carries the secret, so it is redacted even without a scheme to
 * anchor on.
 */
const BARE_QUERY_IN_TEXT = /\?[^\s'"<>`]+/g;

/** Punctuation git appends after a quoted remote, excluded from the URL body. */
const TRAILING_PUNCTUATION = /['.,;:)\]]+$/;

/**
 * Render `raw` for human or JSON output with credentials removed.
 *
 * Strings `new URL` cannot parse still get a textual userinfo scrub and the
 * control-character pass, so a malformed URL cannot leak a token either.
 */
export function displayUrl(raw: string): string {
  // `URL` percent-encodes control characters in every component it parses,
  // but the pass is cheap and keeps one guarantee for both return paths.
  return escapeControls(redactOneUrl(raw));
}

/**
 * Redact a single URL without escaping controls, so a caller that escapes
 * once over a whole string (`displayText`) does not escape twice.
 */
function redactOneUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // A malformed URL is exactly what reaches an error message, so the
    // textual userinfo scrub still has to run.
    return raw.replace(RAW_USERINFO, `$1${MASK}@`);
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
  return url.toString();
}

/**
 * Redact every credential-bearing URL found anywhere inside free text.
 *
 * `displayUrl` only handles a string that is entirely one URL. Git's stderr
 * is not: it embeds the remote inside prose, and crew quotes that verbatim in
 * `source_unreachable` messages. Scanning for URL-shaped substrings is what
 * stops a secret escaping through that channel.
 */
export function displayText(text: string): string {
  const withUrls = text.replace(URL_IN_TEXT, (match) => {
    // Git commonly quotes the remote and appends punctuation; redact the URL
    // body and leave the surrounding prose in place.
    const trailing = match.match(TRAILING_PUNCTUATION)?.[0] ?? "";
    const body = trailing.length > 0 ? match.slice(0, -trailing.length) : match;
    return redactOneUrl(body) + trailing;
  });
  const scrubbed = withUrls.replace(BARE_QUERY_IN_TEXT, (match) => {
    const trailing = match.match(TRAILING_PUNCTUATION)?.[0] ?? "";
    const body = trailing.length > 0 ? match.slice(0, -trailing.length) : match;
    return redactQuery(body) + trailing;
  });
  // Escape per line so a genuinely multi-line diagnostic (git's stderr is
  // several lines) keeps its shape, while every other control character —
  // ESC, CR, the ones that could forge output — is still neutralised.
  return scrubbed.split("\n").map(escapeControls).join("\n");
}

/**
 * Redact sensitive parameters in a bare `?query` tail that has no scheme in
 * front of it, reusing the parser by resolving against a throwaway base.
 */
function redactQuery(query: string): string {
  const url = new URL(query, "https://x.invalid/");
  let touched = false;
  for (const name of url.searchParams.keys()) {
    if (SENSITIVE_PARAMS.has(name.toLowerCase())) {
      url.searchParams.set(name, MASK);
      touched = true;
    }
  }
  return touched ? `?${url.searchParams.toString()}` : query;
}

/**
 * Redact credential-bearing values in a `CrewError`'s structured `details`.
 * Keys are preserved because they are part of the §13 machine contract.
 */
export function displayDetails(
  details: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    out[key] = typeof value === "string" ? displayText(value) : value;
  }
  return out;
}

/** Replace C0/C1 control characters with a visible escape. */
function escapeControls(value: string): string {
  return value.replace(CONTROL_CHARS, (ch) => {
    const code = ch.codePointAt(0)!;
    return `\\x${code.toString(16).padStart(2, "0")}`;
  });
}
