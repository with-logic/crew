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

/** Matches an Agent Skills name (also used for tap names). */
export const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

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

  // Qualified form: `tap/skill`.
  if (identifier.includes("/")) {
    const parts = identifier.split("/");
    if (parts.length !== 2) {
      throw new CrewError(
        "invalid_ref",
        `\`${ref}\` looks like a tap reference but has too many \`/\` segments (expected \`tap/skill\`)`,
        { ref },
      );
    }
    const [tap, name] = parts as [string, string];
    if (!(NAME_PATTERN.test(tap) && NAME_PATTERN.test(name))) {
      throw new CrewError(
        "invalid_ref",
        `\`${ref}\` isn't a valid tap reference — names must match [a-z][a-z0-9-]*`,
        { ref },
      );
    }
    return { type: "tap", tap, name, ref: gitRef };
  }

  // Bare name.
  if (!NAME_PATTERN.test(identifier)) {
    throw new CrewError(
      "invalid_ref",
      `\`${ref}\` isn't a valid skill name (must match [a-z][a-z0-9-]*) or a known ref shape`,
      { ref },
    );
  }
  return { type: "tap", tap: null, name: identifier, ref: gitRef };
}
