/**
 * Skill reference parser (§8).
 *
 * A skill reference is the string the user passes to `crew install`, puts
 * in a `metadata.crew.dependencies` entry, or types into `crew info`. It
 * can be one of three shapes:
 *
 *   - path:  `./foo`, `../foo`, `/foo`, `~/foo`
 *   - git:   any https/ssh URL, optionally with `@ref` and/or `//subpath`.
 *            Shorthand hosts `gh:`, `gl:`, `bb:` expand to github/gitlab/
 *            bitbucket. A `.git` suffix is allowed and stripped for
 *            canonicalization.
 *   - tap:   `<skill>` or `<tap>/<skill>`, optionally `@ref`.
 *
 * The precedence rules in §8.5 disambiguate any overlap. `invalid_ref` is
 * thrown for anything that doesn't fit the grammar.
 */

import { isAbsolute, resolve } from "node:path";
import { homedir } from "node:os";
import { CrewError } from "../core/errors.ts";
import type { GitSource, PathSource, Source, TapSource } from "../core/types.ts";

/** Matches an Agent Skills name (also used for tap names). */
export const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/** Shorthand host prefixes known to crew (§8.2). */
const SHORTHAND_HOSTS: Record<string, string> = {
  gh: "github.com",
  gl: "gitlab.com",
  bb: "bitbucket.org",
};

/** Parse a skill reference per §8. `cwd` is used to resolve relative paths. */
export function parseRef(raw: string, cwd: string = process.cwd()): Source {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new CrewError("invalid_ref", "reference is empty");
  }
  const ref = raw.trim();

  // §8.5 precedence: path > explicit URL / shorthand > contains // > tap.
  if (looksLikePath(ref)) return parsePath(ref, cwd);
  if (looksLikeExplicitGit(ref) || looksLikeShorthand(ref)) return parseGit(ref);
  if (ref.includes("//")) return parseGit(ref);
  return parseTap(ref);
}

/** True if `ref` should be treated as a path source. */
function looksLikePath(ref: string): boolean {
  return ref.startsWith("./") || ref.startsWith("../") || ref.startsWith("/") || ref.startsWith("~");
}

/** True if `ref` is a URL-shaped git source. */
function looksLikeExplicitGit(ref: string): boolean {
  return (
    ref.startsWith("https://") ||
    ref.startsWith("http://") ||
    ref.startsWith("git@") ||
    ref.startsWith("file://") ||
    ref.startsWith("ssh://")
  );
}

/** True if `ref` uses a shorthand host prefix like `gh:` or `gl:`. */
function looksLikeShorthand(ref: string): boolean {
  const m = ref.match(/^([a-z]{2}):/);
  if (!m) return false;
  return m[1]! in SHORTHAND_HOSTS;
}

/** Parse a path source and resolve `~` + relatives to an absolute path. */
function parsePath(ref: string, cwd: string): PathSource {
  let path: string;
  if (ref === "~" || ref.startsWith("~/")) {
    path = resolve(homedir(), ref.slice(ref === "~" ? 1 : 2));
  } else if (isAbsolute(ref)) {
    path = ref;
  } else {
    path = resolve(cwd, ref);
  }
  return { type: "path", path };
}

/** Parse a git source per §8.2. Handles URL, ref, and subpath. */
function parseGit(ref: string): GitSource {
  const { head, subpath } = splitSubpath(ref);
  const { url: baseUrl, ref: gitRef } = splitGitRef(head);
  const canonical = canonicalizeUrl(baseUrl);
  if (canonical === null) {
    throw new CrewError("invalid_ref", `not a valid git reference: ${ref}`);
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
  if (idx < 0) return { head: ref, subpath: "" };
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
  if (atIdx <= 0) return { url: head, ref: null };
  const possibleRef = tail.slice(atIdx + 1);
  if (possibleRef.length === 0 || /[\s\/]/.test(possibleRef)) return { url: head, ref: null };
  const url = head.slice(0, head.length - tail.length) + tail.slice(0, atIdx);
  return { url, ref: possibleRef };
}

/** Canonicalize a git URL: expand shorthand, strip `.git`, normalize. */
function canonicalizeUrl(raw: string): string | null {
  let url = raw;

  // Shorthand: `gh:owner/repo`, `gl:owner/repo`, `bb:owner/repo`.
  const shMatch = url.match(/^([a-z]{2}):(.+)$/);
  if (shMatch && shMatch[1]! in SHORTHAND_HOSTS && !url.includes("://") && !url.startsWith("git@")) {
    const host = SHORTHAND_HOSTS[shMatch[1]!]!;
    const body = shMatch[2]!;
    if (!body.includes("/")) return null;
    url = `https://${host}/${body.endsWith(".git") ? body.slice(0, -4) : body}.git`;
  }

  // SSH: `git@host:owner/repo` — keep as-is but validate shape.
  if (url.startsWith("git@")) {
    if (!/^git@[^:\s]+:[^\s]+$/.test(url)) return null;
    return url;
  }

  // HTTP(S): validate and normalize.
  if (url.startsWith("http://") || url.startsWith("https://")) {
    const u = new URL(url);
    if (!u.hostname || !u.pathname || u.pathname === "/") return null;
    // Path must have at least `/owner/repo`.
    const segments = u.pathname.split("/").filter(Boolean);
    if (segments.length < 2) return null;
    return url;
  }

  // file:// and ssh:// URLs: accept as-is (mostly for testing / internal mirrors).
  if (url.startsWith("file://") || url.startsWith("ssh://")) {
    new URL(url); // validate; any parse error bubbles up.
    return url;
  }

  return null;
}

/** Parse a tap source. */
function parseTap(ref: string): TapSource {
  // Split optional `@ref` from the identifier portion.
  const atIdx = ref.lastIndexOf("@");
  let identifier = ref;
  let gitRef: string | null = null;
  if (atIdx > 0) {
    identifier = ref.slice(0, atIdx);
    gitRef = ref.slice(atIdx + 1);
    if (gitRef.length === 0 || /\s/.test(gitRef)) {
      throw new CrewError("invalid_ref", `invalid tap ref: ${ref}`);
    }
  }

  // Qualified form: `tap/skill`.
  if (identifier.includes("/")) {
    const parts = identifier.split("/");
    if (parts.length !== 2) {
      throw new CrewError("invalid_ref", `invalid tap reference: ${ref}`);
    }
    const [tap, name] = parts as [string, string];
    if (!NAME_PATTERN.test(tap) || !NAME_PATTERN.test(name)) {
      throw new CrewError("invalid_ref", `invalid tap reference: ${ref}`);
    }
    return { type: "tap", tap, name, ref: gitRef };
  }

  // Bare name.
  if (!NAME_PATTERN.test(identifier)) {
    throw new CrewError("invalid_ref", `invalid skill name: ${ref}`);
  }
  return { type: "tap", tap: null, name: identifier, ref: gitRef };
}

/**
 * Decide whether a resolved `ref` string is "pinned" (§11.1): exact SHA or
 * tag. We can't distinguish tag from branch without talking to git, so this
 * answers the SHA-only case. `pinned` for tags is marked later, after the
 * git layer reports what kind of ref it resolved.
 */
export function looksLikeSha(ref: string): boolean {
  return /^[0-9a-f]{7,40}$/i.test(ref);
}
