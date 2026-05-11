/**
 * Tap-add source parsing and target display helpers (§16.3).
 */

import { CrewError } from "../../core/errors.ts";
import type { Source, TapConfig } from "../../core/types.ts";
import { parseRef } from "../../refs/parse.ts";

/** Parsed source of a `tap add` argument: git or path. */
export interface TapAddTarget {
  readonly kind: "git" | "path";
  readonly url: string;
  readonly subpath: string;
  readonly path: string;
}

export function parseTapAddTarget(raw: string, cwd: string): TapAddTarget {
  const source: Source = parseRef(raw, cwd);
  if (source.type === "tap")
    throw new CrewError(
      "usage_error",
      `\`${raw}\` looks like a tap reference, not a source — \`crew tap add\` takes a git URL or local path (e.g. \`gh:owner/repo\` or \`./my-skills\`)`,
      { raw },
    );
  if (source.type === "path") return { kind: "path", url: "", subpath: "", path: source.path };
  if (source.ref !== null)
    throw new CrewError(
      "usage_error",
      `\`${raw}\` carries a \`@${source.ref}\` tail — taps track the default branch and can't be pinned. Drop the \`@${source.ref}\` and try again.`,
      { raw, ref: source.ref },
    );
  return { kind: "git", url: source.url, subpath: source.subpath, path: "" };
}

export function sameTap(a: TapConfig, t: TapAddTarget): boolean {
  if (a.kind !== t.kind) return false;
  if (a.kind === "git") return a.url === t.url && a.subpath === t.subpath;
  return a.path === t.path;
}

export function displayTarget(t: TapConfig | TapAddTarget): string {
  if (t.kind === "path") return t.path;
  return t.subpath.length > 0 ? `${t.url}//${t.subpath}` : t.url;
}

export function payloadOf(t: TapAddTarget): Record<string, string> {
  if (t.kind === "path") return { kind: "path", path: t.path };
  return { kind: "git", url: t.url, ...(t.subpath.length > 0 ? { subpath: t.subpath } : {}) };
}
