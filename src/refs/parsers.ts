/**
 * Path and tap parsers for skill references (§8).
 *
 * `parsePath` normalizes `./foo`, `../foo`, `/foo`, `~/foo` to an
 * absolute path. `parseTap` handles bare names (`my-skill`) and
 * qualified names (`core/my-skill`), each with an optional `@ref` tail.
 * `looksLikeSchemelessHost` spots `github.com/o/r`-style arguments
 * (§8.2 "Scheme-less hosts") so the dispatcher can hand them to the
 * git parser with `https://` prepended.
 *
 * The leaner git-URL logic lives in `refs/git-url.ts`.
 */

import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { CrewError } from "../core/errors.ts";
import type { PathSource, TapSource } from "../core/types.ts";

/** Matches a canonical Agent Skills name (also used for stored tap names). */
export const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** True if `ref` should be treated as a path source. */
export function looksLikePath(ref: string): boolean {
  return (
    ref.startsWith("./") || ref.startsWith("../") || ref.startsWith("/") || ref.startsWith("~")
  );
}

/**
 * A bare authority: dot-separated DNS labels with an optional numeric
 * port. Deliberately strict — the scheme-less form prepends `https://`,
 * so anything `new URL` could reinterpret (userinfo, query, fragment,
 * a non-numeric port) must never reach it. `github.com@evil.example/o/r`
 * would otherwise parse as host `evil.example` with `github.com` as
 * userinfo, letting a GitHub-looking reference clone from elsewhere.
 */
const SCHEMELESS_AUTHORITY =
  /^(?=.*\.)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d+)?$/i;

/**
 * True if `ref` is a scheme-less git host reference (§8.5 rule 4): the
 * first `/`-segment is a bare `host[:port]` containing a `.` (tap names
 * can't) and there are at least `host/owner/repo` segments before any
 * `//subpath` tail.
 */
export function looksLikeSchemelessHost(ref: string): boolean {
  const head = ref.split("//", 1)[0]!;
  const segments = head.split("/");
  if (segments.length < 3) return false;
  return SCHEMELESS_AUTHORITY.test(segments[0]!);
}

/** Parse a path source and resolve `~` + relatives to an absolute path. */
export function parsePath(ref: string, cwd: string): PathSource {
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

/** Parse a tap source. */
export function parseTap(ref: string): TapSource {
  // Split optional `@ref` from the identifier portion.
  const atIdx = ref.lastIndexOf("@");
  let identifier = ref;
  let gitRef: string | null = null;
  if (atIdx > 0) {
    identifier = ref.slice(0, atIdx);
    gitRef = ref.slice(atIdx + 1);
    if (gitRef.length === 0 || /\s/.test(gitRef)) {
      throw new CrewError(
        "invalid_ref",
        `\`${ref}\` has an invalid \`@ref\` tail (refs can't be empty or contain whitespace)`,
        { ref },
      );
    }
  }

  // Qualified form: `tap/skill`, `ns/skill`, or `tap/ns/skill`.
  if (identifier.includes("/")) {
    const parts = identifier.split("/");
    if (parts.length > 3) {
      throw new CrewError(
        "invalid_ref",
        `\`${ref}\` has too many \`/\` segments (expected \`tap/skill\` or \`tap/namespace/skill\`)`,
        { ref },
      );
    }
    const normalized: string[] = [];
    for (const p of parts) {
      const lower = p.toLowerCase();
      if (!NAME_PATTERN.test(lower)) {
        throw new CrewError(
          "invalid_ref",
          `\`${ref}\` isn't a valid tap reference — names may only contain letters, digits, and hyphens`,
          { ref },
        );
      }
      normalized.push(lower);
    }
    if (parts.length === 3) {
      const [tap, namespace, name] = normalized as [string, string, string];
      return {
        type: "tap",
        tap,
        namespace,
        name,
        ref: gitRef,
      };
    }
    // 2-segment: leave disambiguation (tap/skill vs namespace/skill) to
    // the resolver. We store the first segment in `tap` as the common
    // case; the resolver falls back to namespace interpretation if no
    // tap of that name exists.
    const [first, second] = normalized as [string, string];
    return {
      type: "tap",
      tap: first,
      namespace: null,
      name: second,
      ref: gitRef,
    };
  }

  // Bare name.
  const name = identifier.toLowerCase();
  if (!NAME_PATTERN.test(name)) {
    throw new CrewError(
      "invalid_ref",
      `\`${ref}\` isn't a valid skill name (names may only contain letters, digits, and hyphens) or a known ref shape`,
      { ref },
    );
  }
  return {
    type: "tap",
    tap: null,
    namespace: null,
    name,
    ref: gitRef,
  };
}
