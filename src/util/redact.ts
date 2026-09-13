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
 *
 * The same two hazards reach the user through error output, not just
 * verbose progress, so this module serves both. A failed clone quotes
 * git's own stderr — which repeats the remote URL — and carries a
 * structured `details` payload; `redactText` and `redactDetails` cover
 * those channels. Every user-visible string should pass through one of
 * the `safe*` / `redact*` helpers before it reaches a stream.
 */

/**
 * Query parameters whose values are safe to print. Everything else is
 * masked.
 *
 * This is deliberately an allow-list rather than a list of secret-sounding
 * names. A blocklist fails open: the first provider to spell its parameter
 * `client_secret`, `sig`, or `auth` leaks in full until someone notices and
 * adds the name. Inverting makes the failure mode a needlessly masked
 * identifier, which costs a little clarity in a diagnostic, instead of a
 * published credential.
 *
 * Only git's own transport parameters belong here — values crew or git put
 * in a URL itself, never something a user pasted.
 */
const DISPLAYABLE_PARAMS = new Set(["service", "ref", "version"]);

const REDACTED = "***";

/**
 * Escape C0/C1 control characters so nothing user-controlled can move
 * the cursor, inject ANSI sequences, or forge a second output line.
 *
 * Newlines are escaped like any other control character. A message that
 * genuinely needs multiple lines declares that structure itself — see
 * `sanitizeBlock`, which is the only way to keep a line break.
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
    if (!DISPLAYABLE_PARAMS.has(key.toLowerCase())) {
      url.searchParams.set(key, REDACTED);
    }
  }
  return url.toString();
}

/**
 * Escape a multi-line message, keeping only the line breaks the caller
 * composed as layout and escaping every other control character —
 * including a newline embedded in an interpolated value, which would
 * otherwise open its own terminal line and forge a second message.
 *
 * The distinction is positional, not textual: a caller that wants
 * layout joins trusted literals with "\n" and the split below sees
 * them, while an untrusted newline arrives *inside* one of those
 * segments and is escaped by `sanitizeLine`. That only holds because
 * interpolated values reach here already escaped; this is the second
 * layer, not the first.
 */
export function sanitizeBlock(message: string): string {
  return message
    .split("\n")
    .map((line) => sanitizeLine(line))
    .join("\n");
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

/**
 * Redact every credential-bearing URL found anywhere inside free text.
 *
 * `redactUrl` only handles a string that is *entirely* one URL. Git's
 * stderr is not: it embeds the remote inside prose
 * (`fatal: unable to access 'https://host/r.git?token=s/': …`), and we
 * pass that through verbatim in `source_unreachable` messages. Scanning
 * for URL-shaped substrings is what stops the secret escaping that way.
 */
export function redactText(text: string): string {
  // Match an http(s)/ssh/git URL up to the first character that can't be
  // part of one. Trailing punctuation (quote, comma, period) is excluded
  // so we don't swallow the prose around it.
  return text.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s'"<>`]+/gi, (m) => {
    // Git often quotes the URL and appends a slash; redact the URL body
    // and leave whatever punctuation followed it in place.
    const trailing = m.match(/[.,;:)\]]+$/)?.[0] ?? "";
    const body = trailing.length > 0 ? m.slice(0, -trailing.length) : m;
    return redactUrl(body) + trailing;
  });
}

/**
 * Redact credential-bearing values in a `CrewError`'s structured
 * `details`. The JSON error payload is a stable machine contract
 * (§13), so keys are preserved — only their values are masked.
 */
export function redactDetails(details: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    out[key] = typeof value === "string" ? redactText(value) : value;
  }
  return out;
}
