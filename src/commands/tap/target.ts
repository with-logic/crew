/**
 * Tap-add source parsing and target display helpers (§16.3).
 */

import { CrewError } from "../../core/errors.ts";
import type { Source, TapConfig } from "../../core/types.ts";
import { displayText, displayUrl } from "../../refs/display-url.ts";
import { parseRef } from "../../refs/parse.ts";

/** Parsed source of a `tap add` argument: git or path. */
export interface TapAddTarget {
  readonly kind: "git" | "path";
  readonly url: string;
  readonly subpath: string;
  readonly path: string;
}

const DEFAULT_BRANCH_NAMES: ReadonlySet<string> = new Set(["main", "master"]);

export function parseTapAddTarget(raw: string, cwd: string): TapAddTarget {
  const source: Source = parseRef(raw, cwd);
  if (source.type === "tap")
    throw new CrewError(
      "usage_error",
      `\`${raw}\` looks like a tap reference, not a source — \`crew tap add\` takes a git URL or local path (e.g. \`gh:owner/repo\` or \`./my-skills\`)`,
      { raw },
    );
  if (source.type === "path") return { kind: "path", url: "", subpath: "", path: source.path };
  // §16.3: taps track the default branch. `main`/`master` is taken to
  // name it (so a pasted `/tree/main/...` link works); anything else is
  // a pin we can't honour.
  if (source.ref !== null && !DEFAULT_BRANCH_NAMES.has(source.ref)) {
    // `raw` is the user's argument and may carry credentials (§16.3).
    const shown = displayText(raw);
    throw new CrewError(
      "usage_error",
      `\`${shown}\` carries a \`@${source.ref}\` tail — taps track the default branch and can't be pinned. Drop the \`@${source.ref}\` and try again.`,
      { raw: shown, ref: source.ref },
    );
  }
  return { kind: "git", url: source.url, subpath: source.subpath, path: "" };
}

export function sameTap(a: TapConfig, t: TapAddTarget): boolean {
  if (a.kind !== t.kind) return false;
  if (a.kind === "git") return a.url === t.url && a.subpath === t.subpath;
  return a.path === t.path;
}

/**
 * Render a tap's target for output. Credentials are redacted here rather than
 * at each call site: a tap URL may legitimately carry them (§16.3), and this
 * is the one function every human and JSON surface renders through.
 */
export function displayTarget(t: TapConfig | TapAddTarget): string {
  if (t.kind === "path") return displayText(t.path);
  const url = displayUrl(t.url);
  return t.subpath.length > 0 ? `${url}//${displayText(t.subpath)}` : url;
}

export function payloadOf(t: TapAddTarget): Record<string, string> {
  if (t.kind === "path") return { kind: "path", path: displayText(t.path) };
  return {
    kind: "git",
    url: displayUrl(t.url),
    ...(t.subpath.length > 0 ? { subpath: displayText(t.subpath) } : {}),
  };
}
