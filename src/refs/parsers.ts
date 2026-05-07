/**
 * Path and tap parsers for skill references (§8).
 *
 * `parsePath` normalizes `./foo`, `../foo`, `/foo`, `~/foo` to an
 * absolute path. `parseTap` handles bare names (`my-skill`) and
 * qualified names (`core/my-skill`), each with an optional `@ref` tail.
 *
 * The leaner git-URL logic lives in `refs/git-url.ts`.
 */

import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { CrewError } from "../core/errors.ts";
import type { PathSource, TapSource } from "../core/types.ts";

/** Matches a canonical Agent Skills name (also used for stored tap names). */
export const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
const TAP_REF_NAME_PATTERN = /^[a-z][a-z0-9-]*$/i;

/** True if `ref` should be treated as a path source. */
export function looksLikePath(ref: string): boolean {
  return (
    ref.startsWith("./") || ref.startsWith("../") || ref.startsWith("/") || ref.startsWith("~")
  );
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
    for (const p of parts) {
      if (!TAP_REF_NAME_PATTERN.test(p)) {
        throw new CrewError(
          "invalid_ref",
          `\`${ref}\` isn't a valid tap reference — names must match [a-z][a-z0-9-]*, case-insensitively`,
          { ref },
        );
      }
    }
    if (parts.length === 3) {
      const [tap, namespace, name] = parts as [string, string, string];
      return {
        type: "tap",
        tap: tap.toLowerCase(),
        namespace: namespace.toLowerCase(),
        name: name.toLowerCase(),
        ref: gitRef,
      };
    }
    // 2-segment: leave disambiguation (tap/skill vs namespace/skill) to
    // the resolver. We store the first segment in `tap` as the common
    // case; the resolver falls back to namespace interpretation if no
    // tap of that name exists.
    const [first, second] = parts as [string, string];
    return {
      type: "tap",
      tap: first.toLowerCase(),
      namespace: null,
      name: second.toLowerCase(),
      ref: gitRef,
    };
  }

  // Bare name.
  if (!TAP_REF_NAME_PATTERN.test(identifier)) {
    throw new CrewError(
      "invalid_ref",
      `\`${ref}\` isn't a valid skill name (must match [a-z][a-z0-9-]*, case-insensitively) or a known ref shape`,
      { ref },
    );
  }
  return {
    type: "tap",
    tap: null,
    namespace: null,
    name: identifier.toLowerCase(),
    ref: gitRef,
  };
}
