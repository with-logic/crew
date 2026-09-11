/**
 * Safe rendering of user-controlled strings for `--verbose` output (§5.2).
 *
 * Verbose progress lines echo things the user supplied: git argv (which
 * includes clone URLs), tap URLs, and filesystem paths. Two hazards come
 * with that, and every verbose path routes through this module to avoid
 * both.
 *
 * 1. **Credentials.** Crew accepts remotes carrying secrets —
 *    `https://oauth2:<token>@host/org/repo.git`, `https://<token>@host/…`,
 *    and `…?token=<secret>` — and stores them verbatim in `config.yaml`.
 *    Echoing one to stderr puts a usable token into terminal scrollback
 *    and CI logs. `redactUrl` replaces the secret with `***`.
 *
 *    SSH userinfo is deliberately NOT redacted: `git@host` and
 *    `ssh://git@host/…` carry a username, not a secret, and hiding it
 *    would make the progress line less useful without protecting
 *    anything. Only a password component, or a lone non-`git` userinfo
 *    token (the `https://<token>@host` shape), is treated as secret.
 *
 * 2. **Terminal control characters.** A path or URL can contain ESC or
 *    CR, which would let crafted input move the cursor, recolor output,
 *    or forge additional `crew: …` lines. `sanitizeLine` escapes every
 *    C0/C1 control character to a visible `\xNN` form.
 */

/** Query parameters whose values are secrets rather than identifiers. */
const SENSITIVE_PARAMS = new Set([
  "token",
  "access_token",
  "private_token",
  "api_key",
  "apikey",
  "password",
]);

const REDACTED = "***";

/**
 * Escape C0/C1 control characters so nothing user-controlled can move
 * the cursor, inject ANSI sequences, or forge a second output line.
 */
export function sanitizeLine(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const isC0 = code < 0x20 || code === 0x7f;
    const isC1 = code >= 0x80 && code <= 0x9f;
    if (isC0 || isC1) {
      out += `\\x${code.toString(16).padStart(2, "0")}`;
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Redact credentials from a URL-shaped token, leaving every other
 * string untouched. Returns the input unchanged when it isn't a URL we
 * recognise — callers pass arbitrary argv, most of which is flags.
 */
export function redactUrl(token: string): string {
  if (token.includes("://")) return redactStandardUrl(token);
  // `git@host:owner/repo` — scp-style. The userinfo is a username.
  return token;
}

function redactStandardUrl(token: string): string {
  let url: URL;
  try {
    url = new URL(token);
  } catch {
    // Not parseable as a URL; nothing structured to redact.
    return token;
  }
  if (url.password.length > 0) {
    url.password = REDACTED;
  } else if (url.username.length > 0 && url.username !== "git") {
    // `https://<token>@host/…` — a lone userinfo token on an http(s)
    // remote is a credential, not a login name.
    if (url.protocol === "http:" || url.protocol === "https:") {
      url.username = REDACTED;
    }
  }
  for (const key of url.searchParams.keys()) {
    if (SENSITIVE_PARAMS.has(key.toLowerCase())) {
      url.searchParams.set(key, REDACTED);
    }
  }
  return url.toString();
}

/** Render one URL for a progress line: credentials redacted, controls escaped. */
export function safeUrl(token: string): string {
  return sanitizeLine(redactUrl(token));
}

/** Render an argv for a progress line, redacting any URL-shaped argument. */
export function safeArgs(args: readonly string[]): string {
  return sanitizeLine(args.map(redactUrl).join(" "));
}

/** Render a filesystem path (or any plain value) for a progress line. */
export function safePath(path: string): string {
  return sanitizeLine(path);
}
