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
import type { TapConfig } from "./types.ts";

/**
 * Normalize a clone URL so spellings of the same repository agree: drop
 * a trailing `.git` and any trailing slashes, and lowercase the scheme
 * and host. The path keeps its case — forges such as GitHub preserve it
 * and some hosts are case-sensitive.
 *
 * This is deliberately conservative: it only folds differences that
 * cannot change which repository is addressed.
 */
export function canonicalRepoUrl(url: string): string {
  let out = url.trim();
  const schemeEnd = out.indexOf("://");
  if (schemeEnd >= 0) {
    const scheme = out.slice(0, schemeEnd).toLowerCase();
    const rest = out.slice(schemeEnd + 3);
    const slash = rest.indexOf("/");
    // Authority is everything up to the first path separator.
    const authority = (slash >= 0 ? rest.slice(0, slash) : rest).toLowerCase();
    const path = slash >= 0 ? rest.slice(slash) : "";
    out = `${scheme}://${authority}${path}`;
  } else {
    // scp-style `git@host:owner/repo` — lowercase up to the colon.
    const colon = out.indexOf(":");
    if (colon >= 0) out = out.slice(0, colon).toLowerCase() + out.slice(colon);
  }
  out = out.replace(/\/+$/, "");
  if (out.endsWith(".git")) out = out.slice(0, -4);
  return out.replace(/\/+$/, "");
}

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
  const withoutScheme = canonical.replace(/^[a-z0-9+.-]+:\/\//i, "");
  const segments = withoutScheme
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
