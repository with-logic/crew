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
 *   2. The result is a display string, not a clone URL. Userinfo is
 *      masked to `***`, query strings and fragments are dropped, and
 *      control characters are escaped before it reaches a terminal or a
 *      JSON field (§13).
 */

import type { Config, StateEntry, TapConfig } from "../../core/types.ts";
import { SHORTHAND_HOSTS } from "../../refs/git-url.ts";
import { shortenHome } from "../../util/format.ts";
import { displayUrl, safeLabel } from "./display-safety.ts";

// Re-exported so callers outside this directory never reach past
// `index.ts` into the internals (a stale flat copy of this module was
// previously importable and drifted).
export { safeLabel } from "./display-safety.ts";

/**
 * Host → display prefix, inverted from the parser's own prefix → host
 * table so the two cannot disagree about which hosts have a shorthand.
 * GitHub is rendered `@owner/repo` rather than `gh:`, since `@` is the
 * form §8.2 calls the ergonomic alias, so it is excluded here and
 * special-cased in `shorthandFor`.
 */
const HOST_SHORTHANDS: Record<string, string> = Object.fromEntries(
  Object.entries(SHORTHAND_HOSTS)
    .filter(([, host]) => host !== "github.com")
    .map(([prefix, host]) => [host, `${prefix}:`]),
);

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
  const repo = repoLabel(tap.url);
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
export function repoLabel(url: string): string {
  const clean = displayUrl(url);
  // `file://` has no host to shorten against, and its path is the whole
  // identity of the repo, so there is no shorthand to try — return the
  // display form unchanged. Note `clean` has already been through
  // `displayUrl`, so a credential or control character in the path is
  // masked or escaped here too; this is a display string, not a URL to
  // clone from.
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

function stripGitSuffix(segment: string): string {
  return segment.endsWith(".git") ? segment.slice(0, -4) : segment;
}

/** Join two POSIX fragments, tolerating either (or both) being empty. */
function joinPosix(head: string, tail: string): string {
  if (head.length === 0) return tail;
  if (tail.length === 0) return head;
  return `${head.replace(/\/+$/, "")}/${tail}`;
}
