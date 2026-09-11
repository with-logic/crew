/**
 * Human-readable source labels for installed skills (§5.1, §9.1).
 *
 * `state.source.tap` is a tap *name*. For a registered tap that name is
 * the one every tap subcommand takes, so showing it is right. For an auto
 * tap (§16.5) the name was derived by crew — `skills-internal-comms` for a
 * repo the user referred to as `@anthropics/skills//skills/internal-comms`
 * — and echoing it back tells the user nothing.
 *
 * `sourceLabel` renders an auto tap as a reference. Two rules keep the
 * label honest:
 *
 *   1. A shorthand (`@owner/repo`, `gl:`, `bb:`) is used only when it
 *      round-trips through `parseRef` to the *exact* recorded URL. An
 *      SSH remote is not interchangeable with its HTTPS spelling — it has
 *      a different protocol and different credentials — so it keeps its
 *      explicit URL rather than being relabelled as something the user
 *      would clone differently.
 *   2. The result is a display string: credentials, query strings,
 *      fragments, and control characters are stripped before it reaches a
 *      terminal (§13).
 */

import type { Config, StateEntry, TapConfig } from "../core/types.ts";
import { shortenHome } from "../util/format.ts";

/** Hosts with a `<prefix>:owner/repo` shorthand (§8.2). GitHub uses `@`. */
const HOST_SHORTHANDS: Record<string, string> = {
  "gitlab.com": "gl:",
  "bitbucket.org": "bb:",
};

/** Taps keyed by name — build once per command, not once per row. */
export type TapsByName = ReadonlyMap<string, TapConfig>;

/**
 * Index taps by name. A listing renders one label per row, so scanning
 * `config.taps` inside `sourceLabel` would make a long listing quadratic.
 */
export function tapIndex(config: Config): TapsByName {
  const byName = new Map<string, TapConfig>();
  for (const tap of config.taps) byName.set(tap.name, tap);
  return byName;
}

/**
 * The source string to show a human for `entry`. Registered taps keep
 * their configured name; auto taps render as a reference. An entry whose
 * tap is no longer in config falls back to the raw `tap/path`.
 */
export function sourceLabel(entry: StateEntry, taps: TapsByName): string {
  const tap = taps.get(entry.source.tap);
  if (!tap || tap.registered) return safeLabel(rawLabel(entry));
  if (tap.kind === "path") return safeLabel(pathLabel(tap, entry.source.path));
  return safeLabel(gitLabel(tap, entry.source.path));
}

/** True when the entry's source is an auto tap whose name is crew-derived. */
export function isAutoTapSource(entry: StateEntry, taps: TapsByName): boolean {
  const tap = taps.get(entry.source.tap);
  return tap !== undefined && !tap.registered;
}

/** `<tap>` or `<tap>/<path>` — the shape used before auto taps got labels. */
function rawLabel(entry: StateEntry): string {
  if (entry.source.path.length === 0) return entry.source.tap;
  return `${entry.source.tap}/${entry.source.path}`;
}

/** Auto path tap: the directory the skill actually lives in. */
function pathLabel(tap: TapConfig, entryPath: string): string {
  return shortenHome(joinPosix(tap.path, entryPath));
}

/**
 * Auto git tap: `<repo-ref>//<location>`, where the location is the
 * tap's subpath joined with the skill's path inside the tap. The `//`
 * separator is what `parseRef` expects, so the label parses back to the
 * same URL and subpath.
 */
function gitLabel(tap: TapConfig, entryPath: string): string {
  const repo = repoRef(tap.url);
  const location = joinPosix(tap.subpath, entryPath);
  return location.length === 0 ? repo : `${repo}//${location}`;
}

/**
 * Shortest reference form for a clone URL that still resolves to that
 * exact URL: `@owner/repo` on GitHub, `gl:`/`bb:` on the other shorthand
 * hosts. Anything else — a self-hosted host, an SSH or SCP remote, a URL
 * carrying credentials — keeps an explicit, display-safe URL, because a
 * shortened form would either not parse or would name a different remote.
 */
export function repoRef(url: string): string {
  const clean = displayUrl(url);
  // `file://` has no host to shorten against, and its path is the whole
  // identity of the repo — keep it exactly as the user would type it.
  if (clean.startsWith("file://")) return clean;
  const shorthand = shorthandFor(clean);
  return shorthand ?? clean;
}

/**
 * The `@owner/repo` / `gl:` / `bb:` spelling for `url`, or null when no
 * shorthand resolves back to it. Only `https://host/owner/repo[.git]`
 * qualifies: the shorthands expand to HTTPS, so an SSH remote must not
 * borrow them.
 */
function shorthandFor(url: string): string | null {
  const match = url.match(/^https:\/\/([^/@:]+)\/(.+)$/);
  if (!match) return null;
  const host = match[1]!;
  const prefix = host === "github.com" ? "@" : HOST_SHORTHANDS[host];
  if (prefix === undefined) return null;
  const segments = match[2]!.split("/").filter((s) => s.length > 0);
  if (segments.length !== 2) return null;
  return `${prefix}${segments[0]!}/${stripGitSuffix(segments[1]!)}`;
}

/**
 * Strip anything from a URL that must never reach a terminal or a JSON
 * field, while keeping the result a URL that still clones.
 *
 * A bare username is part of how a remote is addressed — `git@github.com`
 * is the protocol's fixed account, not a secret — so it stays. A
 * `user:password@` pair is a credential and is masked. Query strings and
 * fragments are dropped entirely: they are never part of a clone URL crew
 * recorded, and are a common place to smuggle a token.
 */
function displayUrl(url: string): string {
  const schemeIdx = url.indexOf("://");
  if (schemeIdx < 0) return maskUserinfo(url);
  const scheme = url.slice(0, schemeIdx + 3);
  let rest = url.slice(schemeIdx + 3);
  const cut = firstIndexOf(rest, ["?", "#"]);
  if (cut >= 0) rest = rest.slice(0, cut);
  return `${scheme}${maskUserinfo(rest)}`;
}

/**
 * Mask a password in an authority: `user:secret@host` → `user:***@host`.
 * A lone `user@host` is left alone — see `displayUrl`.
 */
function maskUserinfo(authorityAndPath: string): string {
  const slashIdx = authorityAndPath.indexOf("/");
  const authorityEnd = slashIdx < 0 ? authorityAndPath.length : slashIdx;
  const atIdx = authorityAndPath.lastIndexOf("@", authorityEnd);
  if (atIdx < 0) return authorityAndPath;
  const userinfo = authorityAndPath.slice(0, atIdx);
  const colonIdx = userinfo.indexOf(":");
  if (colonIdx < 0) return authorityAndPath;
  return `${userinfo.slice(0, colonIdx)}:***${authorityAndPath.slice(atIdx)}`;
}

function firstIndexOf(s: string, needles: readonly string[]): number {
  let best = -1;
  for (const n of needles) {
    const i = s.indexOf(n);
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  return best;
}

/**
 * Escape anything that could move a terminal cursor or forge output.
 * Subpaths come from `config.yaml` and `state.json`, which may predate
 * the parser guard, so rendering escapes rather than trusting the input.
 */
function safeLabel(label: string): string {
  let out = "";
  for (const ch of label) {
    const code = ch.codePointAt(0)!;
    out += code < 0x20 || code === 0x7f ? `\\x${code.toString(16).padStart(2, "0")}` : ch;
  }
  return out;
}

function stripGitSuffix(segment: string): string {
  return segment.endsWith(".git") ? segment.slice(0, -4) : segment;
}

/** Join two POSIX fragments, tolerating either (or both) being empty. */
function joinPosix(head: string, tail: string): string {
  if (head.length === 0) return tail;
  if (tail.length === 0) return head;
  return `${head.replace(/\/+$/, "")}/${tail}`;
}
