/**
 * Human-readable source labels for installed skills (§5.1, §9.1).
 *
 * `state.source.tap` is a tap *name*. For a registered tap that name is
 * what the user typed, so showing it is right. For an auto tap (§16.5)
 * the name was derived by crew — `skills-internal-comms` for a repo the
 * user referred to as `@anthropics/skills//skills/internal-comms` — and
 * echoing it back tells the user nothing.
 *
 * `sourceLabel` renders an auto tap as the shortest reference form that
 * still round-trips through `parseRef` to the same URL + subpath, so the
 * label a user reads in `crew list` is a string they can paste back into
 * `crew install`.
 */

import type { Config, StateEntry, TapConfig } from "../core/types.ts";
import { shortenHome } from "../util/format.ts";

/** Hosts with a `<prefix>:owner/repo` shorthand (§8.2). GitHub uses `@`. */
const HOST_SHORTHANDS: Record<string, string> = {
  "gitlab.com": "gl:",
  "bitbucket.org": "bb:",
};

/**
 * The source string to show a human for `entry`. Registered taps keep
 * their configured name; auto taps render as a reference. An entry whose
 * tap is no longer in config falls back to the raw `tap/path`.
 */
export function sourceLabel(entry: StateEntry, config: Config): string {
  const tap = config.taps.find((t) => t.name === entry.source.tap);
  if (!tap || tap.registered) return rawLabel(entry);
  if (tap.kind === "path") return pathLabel(tap, entry.source.path);
  return gitLabel(tap, entry.source.path);
}

/** True when the entry's source is an auto tap whose name is crew-derived. */
export function isAutoTapSource(entry: StateEntry, config: Config): boolean {
  const tap = config.taps.find((t) => t.name === entry.source.tap);
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
 * Shortest reference form for a clone URL: `@owner/repo` on GitHub,
 * `gl:`/`bb:` on the other shorthand hosts, `host/owner/repo` elsewhere.
 * A URL crew can't decompose is returned unchanged — better a long
 * label than a wrong one.
 */
export function repoRef(url: string): string {
  // `file://` has no host to shorten against, and its path is the whole
  // identity of the repo — keep it exactly as the user would type it.
  if (url.startsWith("file://")) return url;
  const withoutScheme = stripScheme(url);
  const [host, ...segments] = withoutScheme.split("/").filter((s) => s.length > 0);
  if (host === undefined || segments.length < 2) return url;
  const ownerRepo = `${segments.slice(0, -1).join("/")}/${stripGitSuffix(segments.at(-1)!)}`;
  if (host === "github.com") return `@${ownerRepo}`;
  const shorthand = HOST_SHORTHANDS[host];
  if (shorthand !== undefined) return `${shorthand}${ownerRepo}`;
  return `${host}/${ownerRepo}`;
}

/**
 * Reduce any clone URL to `host/owner/repo` form: drop `scheme://`, drop
 * a `user@` credential prefix, and turn the SCP-style `host:owner/repo`
 * separator into a slash so one split handles every spelling.
 */
function stripScheme(url: string): string {
  const schemeIdx = url.indexOf("://");
  let rest = schemeIdx >= 0 ? url.slice(schemeIdx + 3) : url;
  const atIdx = rest.indexOf("@");
  const slashIdx = rest.indexOf("/");
  // A `user@host` prefix only counts when the `@` precedes the path.
  if (atIdx >= 0 && (slashIdx < 0 || atIdx < slashIdx)) rest = rest.slice(atIdx + 1);
  // `git@host:owner/repo` — the colon separates host from path. A colon
  // followed by digits is a port, which stays part of the host.
  return rest.replace(/:(?!\d)/, "/");
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
