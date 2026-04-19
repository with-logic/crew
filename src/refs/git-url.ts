/**
 * Git URL parsing and canonicalization for skill references (§8.2).
 *
 * Handles every git-shaped form crew accepts: full URLs (https, http,
 * ssh, git@, file://), host shorthands (`gh:`, `gl:`, `bb:`), and the
 * leading-`@owner/repo` GitHub alias. Also splits an optional `@<ref>`
 * tail and a `//<subpath>` tail off the URL portion.
 *
 * `canonicalizeUrl` normalizes the URL to the form we'll record in state
 * and markers: `https://host/owner/repo.git` for shorthands, the raw
 * string for SSH / file / http(s). Returns `null` for anything we can't
 * recognise — callers turn that into `invalid_ref`.
 */

import { CrewError } from "../core/errors.ts";
import type { GitSource } from "../core/types.ts";

/** Shorthand host prefixes known to crew (§8.2). */
const SHORTHAND_HOSTS: Record<string, string> = {
  gh: "github.com",
  gl: "gitlab.com",
  bb: "bitbucket.org",
};

/** True if `ref` is a URL-shaped git source. */
export function looksLikeExplicitGit(ref: string): boolean {
  return (
    ref.startsWith("https://") ||
    ref.startsWith("http://") ||
    ref.startsWith("git@") ||
    ref.startsWith("file://") ||
    ref.startsWith("ssh://")
  );
}

/** True if `ref` uses a shorthand host prefix like `gh:` or `gl:`. */
export function looksLikeShorthand(ref: string): boolean {
  const m = ref.match(/^([a-z]{2}):/);
  if (!m) {
    return false;
  }
  return m[1]! in SHORTHAND_HOSTS;
}

/**
 * True if `ref` is the leading-`@` GitHub shorthand (`@owner/repo` with
 * optional `@ref` and `//subpath`). Requires an `owner/repo` body.
 */
export function looksLikeAtShorthand(ref: string): boolean {
  if (!ref.startsWith("@")) return false;
  // Body is everything after `@` up to the first `//` (subpath) or
  // last `@` (ref). We only need to verify the owner/repo shape.
  const beforeSubpath = ref.split("//", 1)[0]!;
  const body = beforeSubpath.slice(1);
  // Strip an optional `@ref` tail — the shorthand can carry one.
  const atIdx = body.lastIndexOf("@");
  const ownerRepo = atIdx > 0 ? body.slice(0, atIdx) : body;
  const parts = ownerRepo.split("/");
  if (parts.length !== 2) return false;
  const [owner, repo] = parts as [string, string];
  return owner.length > 0 && repo.length > 0;
}

/** Parse a git source per §8.2. Handles URL, ref, and subpath. */
export function parseGit(ref: string): GitSource {
  const { head, subpath } = splitSubpath(ref);
  const { url: baseUrl, ref: gitRef } = splitGitRef(head);
  const canonical = canonicalizeUrl(baseUrl);
  if (canonical === null) {
    throw new CrewError("invalid_ref", `\`${ref}\` isn't a valid git reference`, { ref });
  }
  return {
    type: "git",
    url: canonical,
    ref: gitRef,
    subpath,
  };
}

/** Split `head//sub` into head and subpath. Empty subpath if no `//`. */
function splitSubpath(ref: string): { head: string; subpath: string } {
  // For URL-shaped refs we must not confuse `https://` with the `//` separator.
  // Strategy: find the first `//` that doesn't belong to the scheme delimiter.
  const schemeIdx = ref.indexOf("://");
  const searchFrom = schemeIdx >= 0 ? schemeIdx + 3 : 0;
  const idx = ref.indexOf("//", searchFrom);
  if (idx < 0) {
    return { head: ref, subpath: "" };
  }
  return { head: ref.slice(0, idx), subpath: ref.slice(idx + 2) };
}

/** Split `head@ref` into `{url, ref}`. Some URLs contain `@` (ssh-style user); handle that. */
function splitGitRef(head: string): { url: string; ref: string | null } {
  // Ssh-style `git@host:owner/repo` has an `@` that does not delimit a ref.
  // Strategy: the ref, if present, is everything after the LAST `@` in the
  // tail-segment of the URL (after the last `/`), and it must not contain a `:`.
  const lastSlash = head.lastIndexOf("/");
  const tail = lastSlash >= 0 ? head.slice(lastSlash + 1) : head;
  const atIdx = tail.lastIndexOf("@");
  if (atIdx <= 0) {
    return { url: head, ref: null };
  }
  const possibleRef = tail.slice(atIdx + 1);
  if (possibleRef.length === 0 || /[\s/]/.test(possibleRef)) {
    return { url: head, ref: null };
  }
  const url = head.slice(0, head.length - tail.length) + tail.slice(0, atIdx);
  return { url, ref: possibleRef };
}

/** Canonicalize a git URL: expand shorthand, strip `.git`, normalize. */
function canonicalizeUrl(raw: string): string | null {
  let url = raw;

  // Leading-`@` GitHub shorthand: `@owner/repo` → github.com. Done
  // before the `gh:`/`gl:` match so we don't recurse into it.
  if (url.startsWith("@") && !url.includes("://")) {
    const body = url.slice(1);
    if (!body.includes("/")) return null;
    url = `https://github.com/${body.endsWith(".git") ? body.slice(0, -4) : body}.git`;
  }

  // Shorthand: `gh:owner/repo`, `gl:owner/repo`, `bb:owner/repo`.
  const shMatch = url.match(/^([a-z]{2}):(.+)$/);
  if (
    shMatch &&
    shMatch[1]! in SHORTHAND_HOSTS &&
    !url.includes("://") &&
    !url.startsWith("git@")
  ) {
    const host = SHORTHAND_HOSTS[shMatch[1]!]!;
    const body = shMatch[2]!;
    if (!body.includes("/")) {
      return null;
    }
    url = `https://${host}/${body.endsWith(".git") ? body.slice(0, -4) : body}.git`;
  }

  // SSH: `git@host:owner/repo` — keep as-is but validate shape.
  if (url.startsWith("git@")) {
    if (!/^git@[^:\s]+:[^\s]+$/.test(url)) {
      return null;
    }
    return url;
  }

  // HTTP(S): validate and normalize.
  if (url.startsWith("http://") || url.startsWith("https://")) {
    const u = new URL(url);
    if (!(u.hostname && u.pathname) || u.pathname === "/") {
      return null;
    }
    // Path must have at least `/owner/repo`.
    const segments = u.pathname.split("/").filter(Boolean);
    if (segments.length < 2) {
      return null;
    }
    return url;
  }

  // file:// and ssh:// URLs: accept as-is (mostly for testing / internal mirrors).
  if (url.startsWith("file://") || url.startsWith("ssh://")) {
    new URL(url); // validate; any parse error bubbles up.
    return url;
  }

  return null;
}
