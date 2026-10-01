/**
 * Where a git tap's clone lives on disk (§6).
 *
 * Clone directories are keyed by *repository*, not by tap name. Several
 * tap rows can point at one repo — `@acme/skills//docs` and
 * `@acme/skills//tools` are two taps over the same clone — and keying
 * by tap name meant cloning the same repository once per subpath a user
 * touched. Keying by canonical URL gives each repo exactly one clone,
 * shared by every tap row that references it.
 *
 * A tap row keeps its own identity (name, url, subpath, registered,
 * discovery). Only the bytes are shared.
 *
 * Directory name is `<host>-<owner>-<repo>-<hash8>`: the readable part
 * is for humans poking around `~/.crew/repos/`, and the hash of the
 * canonical URL is what actually guarantees uniqueness.
 */

import { createHash } from "node:crypto";
import { join } from "node:path";
import { crewHome, paths } from "./paths.ts";
import { canonicalRepoUrl } from "./repo-url.ts";
import type { TapConfig } from "./types.ts";

/** True when both URLs address the same repository (§16.3). */
export function sameRepoUrl(a: string, b: string): boolean {
  return canonicalRepoUrl(a) === canonicalRepoUrl(b);
}

/** Lowercase alphanumerics and hyphens; everything else becomes a hyphen. */
function slugSegment(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The readable prefix of a clone directory: up to the last three
 * path-ish segments of the URL (typically host, owner, repo).
 */
function readablePrefix(canonical: string): string {
  // The hash keeps full identity, but directory names must never publish secrets.
  const address = canonical.split(/[?#]/, 1)[0]!;
  const withoutScheme = address.replace(/^[a-z0-9+.-]+:\/\//i, "");
  const authorityEnd = address.includes("://")
    ? withoutScheme.indexOf("/")
    : withoutScheme.indexOf(":");
  const authority = authorityEnd < 0 ? withoutScheme : withoutScheme.slice(0, authorityEnd);
  const host = authority.slice(authority.lastIndexOf("@") + 1);
  const safe = host + (authorityEnd < 0 ? "" : withoutScheme.slice(authorityEnd));
  const segments = safe
    .split(/[/:]/)
    .filter((s) => s.length > 0)
    .map(slugSegment)
    .filter((s) => s.length > 0);
  const tail = segments.slice(-3).join("-");
  return tail.length > 0 ? tail : "repo";
}

/** Directory name for a repository's shared clone. */
export function repoDirName(url: string): string {
  const canonical = canonicalRepoUrl(url);
  const hash = createHash("sha256").update(canonical).digest("hex").slice(0, 8);
  return `${readablePrefix(canonical)}-${hash}`;
}

/** Absolute path to a repository's shared clone. */
export function repoClonePath(url: string, home: string = crewHome()): string {
  return join(paths(home).reposDir, repoDirName(url));
}

/**
 * Where this tap's contents live before its subpath is applied. Git taps
 * share a clone per repository; path taps are the directory itself.
 */
export function tapClonePath(
  tap: Pick<TapConfig, "kind" | "url" | "path">,
  home: string = crewHome(),
): string {
  if (tap.kind === "path") return tap.path;
  return repoClonePath(tap.url, home);
}

/**
 * True when some tap other than `excluding` still needs `tap`'s clone.
 * Removing a tap row must not delete bytes another row is using (§16.3).
 */
export function cloneStillReferenced(
  tap: Pick<TapConfig, "kind" | "url" | "name">,
  remaining: readonly TapConfig[],
): boolean {
  if (tap.kind !== "git") return false;
  return remaining.some(
    (t) => t.kind === "git" && t.name !== tap.name && sameRepoUrl(t.url, tap.url),
  );
}
