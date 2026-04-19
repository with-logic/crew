/**
 * `crew tap {add,remove,list}` (§16).
 *
 * Add writes a new tap entry into config.yaml and performs the initial
 * clone. Remove deletes the local clone and removes the entry — with a
 * special rule for the default `core` tap which requires `--force`.
 * List prints every tap with its URL and last-fetched time (stat mtime
 * of the clone directory).
 *
 * A tap can optionally point at a subdirectory of the configured repo
 * (`crew tap add <url>//<subpath>`), useful for monorepos where skills
 * live under e.g. `skills/`. The subpath is stored in config but is
 * otherwise internal — users reference skills by tap name, never by
 * subpath.
 *
 * Shorthand: `crew tap <git-url>` (no `add` keyword) is equivalent to
 * `crew tap add <git-url>`. We detect this by re-parsing the first
 * positional with `parseRef`: anything that comes back as a git source
 * is treated as an `add`. Plain words (subcommand names, typos) fall
 * through to subcommand dispatch.
 */

import { statSync } from "node:fs";
import { DEFAULT_TAP_NAME } from "../config/defaults.ts";
import { readConfig, writeConfig } from "../config/load.ts";
import { CrewError } from "../core/errors.ts";
import { tapPath } from "../core/paths.ts";
import type { TapConfig } from "../core/types.ts";
import { ensureRepo } from "../git/repo.ts";
import { parseRef } from "../refs/parse.ts";
import { withStateLock } from "../state/lock.ts";
import { rmrf } from "../util/fs.ts";
import type { CommandContext, CommandOutput } from "./types.ts";

export function tapCommand(ctx: CommandContext): CommandOutput {
  const sub = ctx.positional[0];
  const rest = ctx.positional.slice(1);
  if (sub === "add") return tapAdd(ctx, rest);
  if (sub === "remove") return tapRemove(ctx, rest);
  if (sub === "list") return tapList(ctx);
  // Shorthand: `crew tap <git-url> [<name>]` → `crew tap add <git-url> [<name>]`.
  // Only dispatch to add when the first positional parses as a git
  // source; plain words fall through to the usage error so typos of
  // `list`/`remove` don't silently try to add them as taps.
  if (sub && looksLikeGitSource(sub, ctx.cwd)) {
    return tapAdd(ctx, ctx.positional);
  }
  throw new CrewError(
    "usage_error",
    "`crew tap` takes one of: `<git-url> [<name>]`, `add <git-url> [<name>]`, `remove <name>`, or `list`",
  );
}

/** True if `ref` parses as a git source (URL, `gh:`, `@owner/repo`, etc.). */
function looksLikeGitSource(ref: string, cwd: string): boolean {
  try {
    return parseRef(ref, cwd).type === "git";
  } catch {
    return false;
  }
}

function tapAdd(ctx: CommandContext, args: readonly string[]): CommandOutput {
  if (args.length < 1)
    throw new CrewError(
      "usage_error",
      "`crew tap add` needs a git URL — e.g. `crew tap add https://github.com/acme/skills.git acme`",
    );
  const rawUrl = args[0]!;
  const { url, subpath } = splitUrlAndSubpath(rawUrl, ctx.cwd);
  const explicitName = args[1];
  const name = explicitName ?? deriveTapName(url, subpath);
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new CrewError(
      "usage_error",
      `tap name \`${name}\` has invalid characters — use lowercase letters, digits, and hyphens only (starting with a letter)`,
      { name },
    );
  }
  let alreadyMatched = false;
  withStateLock(() => {
    const config = readConfig(ctx.home);
    const existing = config.taps.find((t) => t.name === name);
    if (existing) {
      if (sameTap(existing, url, subpath)) {
        // Same name + same target — no-op. Makes `crew tap <url>` idempotent
        // so scripts don't have to special-case "already added."
        alreadyMatched = true;
        return;
      }
      throw new CrewError(
        "usage_error",
        `tap \`${name}\` is already configured at \`${displayTarget(existing)}\` — to add this one under a different name, run \`crew tap add ${rawUrl} <tap-name>\``,
        {
          name,
          existing: displayTarget(existing),
          incoming: displayTarget(subpath === undefined ? { url } : { url, subpath }),
        },
      );
    }
    const newTap: TapConfig = subpath === undefined ? { name, url } : { name, url, subpath };
    const updated = { ...config, taps: [...config.taps, newTap] };
    writeConfig(updated, ctx.home);
    ensureRepo(url, tapPath(name, ctx.home));
  }, ctx.home);
  const target = displayTarget(subpath === undefined ? { url } : { url, subpath });
  if (alreadyMatched) {
    return {
      exitCode: 0,
      human: [`tap ${name} is already configured at ${target} — nothing to do`],
      json: { name, url, ...(subpath === undefined ? {} : { subpath }), already: true },
    };
  }
  return {
    exitCode: 0,
    human: [`added tap ${name} → ${target}`],
    json: { name, url, ...(subpath === undefined ? {} : { subpath }) },
  };
}

/** Parse `<url>` / `<url>//<subpath>` via the shared git-source parser. */
function splitUrlAndSubpath(
  raw: string,
  cwd: string,
): { url: string; subpath: string | undefined } {
  const source = parseRef(raw, cwd);
  if (source.type !== "git") {
    // Non-git source (path, bare tap name) isn't a valid tap target.
    // Reuse the git path so the user sees the same kind of error they'd
    // get from `crew install` on the same input.
    throw new CrewError(
      "usage_error",
      `\`${raw}\` isn't a git URL — \`crew tap add\` needs a git-shaped reference (https://..., git@..., gh:owner/repo, @owner/repo, etc.)`,
      { raw },
    );
  }
  // `ref` (tag/branch/SHA) is meaningless for a tap — taps always
  // track the default branch. Reject it so the user doesn't expect
  // it to pin the tap.
  if (source.ref !== null) {
    throw new CrewError(
      "usage_error",
      `\`${raw}\` carries a \`@${source.ref}\` tail — taps track the default branch and can't be pinned. Drop the \`@${source.ref}\` and try again.`,
      { raw, ref: source.ref },
    );
  }
  return {
    url: source.url,
    subpath: source.subpath.length > 0 ? source.subpath : undefined,
  };
}

function sameTap(a: TapConfig, url: string, subpath: string | undefined): boolean {
  return a.url === url && (a.subpath ?? "") === (subpath ?? "");
}

/** Format a tap's target for human display: `<url>` or `<url>//<subpath>`. */
function displayTarget(t: Pick<TapConfig, "url" | "subpath">): string {
  return t.subpath && t.subpath.length > 0 ? `${t.url}//${t.subpath}` : t.url;
}

function tapRemove(ctx: CommandContext, args: readonly string[]): CommandOutput {
  if (args.length !== 1)
    throw new CrewError(
      "usage_error",
      "`crew tap remove` needs exactly one tap name — see `crew tap list`",
    );
  const name = args[0]!;
  withStateLock(() => {
    const config = readConfig(ctx.home);
    if (!config.taps.some((t) => t.name === name)) {
      throw new CrewError(
        "usage_error",
        `no tap named \`${name}\` is configured — run \`crew tap list\` to see what's there`,
        { name },
      );
    }
    if (name === DEFAULT_TAP_NAME && !ctx.flags.force)
      throw new CrewError(
        "usage_error",
        `\`${DEFAULT_TAP_NAME}\` is the default tap — pass \`--force\` if you're sure you want to remove it`,
      );
    const updated = { ...config, taps: config.taps.filter((t) => t.name !== name) };
    writeConfig(updated, ctx.home);
    rmrf(tapPath(name, ctx.home));
  }, ctx.home);
  return {
    exitCode: 0,
    human: [`removed tap ${name}`],
    json: { name },
  };
}

function tapList(ctx: CommandContext): CommandOutput {
  const config = readConfig(ctx.home);
  const rows = config.taps.map((t) => {
    const p = tapPath(t.name, ctx.home);
    let lastFetched: string | null = null;
    try {
      lastFetched = new Date(statSync(p).mtimeMs).toISOString();
    } catch {
      lastFetched = null;
    }
    return {
      name: t.name,
      url: t.url,
      ...(t.subpath && t.subpath.length > 0 ? { subpath: t.subpath } : {}),
      last_fetched: lastFetched,
    };
  });
  const human = rows.map(
    (r) =>
      `${r.name.padEnd(16)} ${displayTarget(r).padEnd(60)} last_fetched=${r.last_fetched ?? "-"}`,
  );
  return { exitCode: 0, human, json: { taps: rows } };
}

/**
 * Derive a default tap name from `(url, subpath)`.
 *
 * Root taps: last path segment of the URL (minus `.git`). So
 * `https://github.com/acme/skills.git` → `skills`.
 *
 * Subpath taps: `<last-repo-segment>-<last-subpath-segment>` to reduce
 * collisions when every monorepo's tap directory is called `skills`.
 * So `@with-logic/backend//skills` → `backend-skills`.
 *
 * The result is lowercased and any disallowed characters are replaced
 * with `-` so a repo named `MyOrg/MySkills` yields `myskills` rather
 * than failing validation. If sanitization leaves nothing valid, the
 * user must pass an explicit `<name>`.
 */
function deriveTapName(url: string, subpath: string | undefined): string {
  const repoTail = lastSegment(url);
  const repoBase = repoTail.endsWith(".git") ? repoTail.slice(0, -4) : repoTail;
  const raw = !subpath || subpath.length === 0 ? repoBase : `${repoBase}-${lastSegment(subpath)}`;
  return sanitizeDerivedName(raw);
}

/** Lowercase, replace disallowed chars with `-`, collapse/trim `-`. */
function sanitizeDerivedName(raw: string): string {
  const lowered = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-");
  // A tap name must start with a letter. Trim leading non-letters and
  // any trailing `-`. If nothing usable is left, return the raw string
  // so the downstream validator's error message quotes what the user
  // would have seen derived.
  const trimmed = lowered.replace(/^[^a-z]+/, "").replace(/-+$/, "");
  return trimmed.length > 0 ? trimmed : raw;
}

/** Last path component of a URL or path, ignoring empty segments. */
function lastSegment(s: string): string {
  let tail = s;
  const scheme = tail.indexOf("://");
  if (scheme >= 0) tail = tail.slice(scheme + 3);
  const parts = tail.split(/[/:]/).filter(Boolean);
  return parts[parts.length - 1] ?? "tap";
}
