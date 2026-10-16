/**
 * Tap-add source parsing and target display helpers (§16.3).
 */

import { gitTapMatches } from "../../config/find-tap.ts";
import { CrewError } from "../../core/errors.ts";
import { isGistUrl } from "../../core/gist-url.ts";
import type { Source, TapConfig, TapSource } from "../../core/types.ts";
import { displayText, displayUrl } from "../../refs/display-url.ts";
import { isGistFileName } from "../../refs/gist.ts";
import { parseRef } from "../../refs/parse.ts";
import { shellQuote } from "../../util/format.ts";

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
      ownerRepoRemedy(source),
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
  // §16.3: a gist tap is always the whole gist; `//<file>` names one skill of it.
  if (source.subpath.length > 0 && isGistUrl(source.url)) {
    const shown = displayText(raw);
    const file = displayText(source.subpath);
    const remedy = isGistFileName(source.subpath)
      ? `Drop the \`//${file}\` to add the gist, or install just that skill with \`crew install ${shellQuote(shown)}\`.`
      : `Drop the \`//${file}\` to add the gist. A gist's skills are the \`.md\` files at its top level.`;
    throw new CrewError(
      "usage_error",
      `\`${shown}\` names one file of a gist, but a gist is added as a tap whole`,
      { raw: shown, subpath: file },
      remedy,
    );
  }
  return { kind: "git", url: source.url, subpath: source.subpath, path: "" };
}

/**
 * §16.3: `crew tap add acme/skills` is almost always a GitHub repo with
 * the `@` forgotten. Two plain segments get that suggestion; anything
 * else keeps the default remedy.
 */
function ownerRepoRemedy(source: TapSource): string | undefined {
  if (source.tap === null || source.namespace !== null) return undefined;
  // A `@ref` tail does not change what the user meant, so the
  // correction still applies — it is carried through so the suggested
  // command keeps the revision they asked for. `tap add` rejects a
  // pinned tap separately, with its own message.
  const ref = source.ref === null ? "" : `@${source.ref}`;
  const suggestion = shellQuote(`@${source.tap}/${source.name}${ref}`);
  return `If you meant the GitHub repository ${source.tap}/${source.name}, run \`crew tap add ${suggestion}\`.`;
}

export function sameTap(a: TapConfig, t: TapAddTarget): boolean {
  if (a.kind !== t.kind) return false;
  if (a.kind === "git") return gitTapMatches(a, t.url, t.subpath);
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
