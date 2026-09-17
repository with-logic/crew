/**
 * Splitting the `@<ref>` and `//<subpath>` tails off a git reference (§8.2, §8.4).
 *
 * Both tails are optional and the subpath is removed first, which is what lets
 * a ref contain `/`: once `//python` is gone, everything after the final `@`
 * is the ref, slashes and all.
 *
 * Extracted from `git-url.ts` to keep that file under the 200-line cap.
 *
 * `hostEnd` exists because two legitimate `@` uses are not ref delimiters:
 * HTTPS userinfo (`https://user:token@host/…`, which crew preserves so a
 * private repo still clones) and scp-style SSH (`git@host:owner/repo`). Ref
 * detection therefore starts after the authority, never at the first `@`.
 */

/** Split `head//sub` into head and subpath. Empty subpath if no `//`. */
export function splitSubpath(ref: string): { head: string; subpath: string } {
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

/**
 * Split `head@ref` into `{url, ref}`.
 *
 * Two `@` forms are not ref delimiters and must survive: the ssh-style user
 * in `git@host:owner/repo`, and HTTPS userinfo in `https://user:tok@host/o/r`.
 * Both sit before the host, so the ref (if any) is after the LAST `@`.
 *
 * A ref may itself contain `/` (`@feature/foo`, §8.2). `splitSubpath` has
 * already removed any `//<subpath>` tail by the time we get here, so a
 * remaining `/` after the final `@` belongs to the ref — but only when that
 * `@` comes after the host, which `hostEnd` pins down. That keeps
 * `https://user:tok@host/owner/repo` a plain URL rather than reading
 * `host/owner/repo` as a ref.
 */
export function splitGitRef(head: string): { url: string; ref: string | null } {
  const atIdx = head.lastIndexOf("@");
  if (atIdx <= 0) {
    return { url: head, ref: null };
  }
  // Everything before the first `/` of the path is host territory; an `@`
  // there is userinfo, not a ref delimiter.
  if (atIdx < hostEnd(head)) {
    return { url: head, ref: null };
  }
  const possibleRef = head.slice(atIdx + 1);
  if (possibleRef.length === 0 || /[\s:]/.test(possibleRef)) {
    return { url: head, ref: null };
  }
  return { url: head.slice(0, atIdx), ref: possibleRef };
}

/**
 * Index at which the host portion of `head` ends: the first `/` of the path
 * for scheme URLs, the `:` for ssh-style `git@host:owner/repo`, else the
 * whole string (a bare `owner/repo` shorthand has no host).
 */
function hostEnd(head: string): number {
  const schemeIdx = head.indexOf("://");
  if (schemeIdx >= 0) {
    const slash = head.indexOf("/", schemeIdx + 3);
    return slash < 0 ? head.length : slash;
  }
  if (head.startsWith("git@")) {
    const colon = head.indexOf(":");
    return colon < 0 ? head.length : colon;
  }
  return 0;
}
