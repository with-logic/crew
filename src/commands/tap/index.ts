/**
 * `crew tap {add,remove,list,update}` (§16).
 *
 * Add writes a new tap entry into config.yaml and performs the initial
 * clone (for git taps). Remove deletes the local clone and removes the
 * entry — with a special rule for the default `core` tap which
 * requires `--force`. List prints every tap with its kind, target, and
 * last-fetched time. Update fetches one or every git-kind tap.
 *
 * `crew tap add` against a URL/path that already backs an **auto** tap
 * promotes it to registered (no re-clone). Against a registered tap
 * with a matching target, it's an idempotent no-op. Against a
 * different target with the same name, it's a usage error.
 *
 * Shorthand: `crew tap <git-url-or-path> [<name>]` (no `add` keyword)
 * is equivalent to `crew tap add <…> [<name>]`. Detected by re-parsing
 * the first positional with `parseRef`.
 */

import { statSync } from "node:fs";
import { DEFAULT_TAP_NAME } from "../../config/defaults.ts";
import { readConfig, writeConfig } from "../../config/load.ts";
import { CrewError } from "../../core/errors.ts";
import { tapPath } from "../../core/paths.ts";
import type { Source, TapConfig } from "../../core/types.ts";
import { ensureClone } from "../../git/repo.ts";
import { deriveAutoTapName } from "../../install/tap-naming.ts";
import { parseRef } from "../../refs/parse.ts";
import { withStateLock } from "../../state/lock.ts";
import { exists, isDirectory, rmrf } from "../../util/fs.ts";
import type { CommandContext, CommandOutput } from "../types.ts";
import { refreshTaps, type TapRefreshRow } from "./refresh.ts";

export function tapCommand(ctx: CommandContext): CommandOutput {
  const sub = ctx.positional[0];
  const rest = ctx.positional.slice(1);
  if (sub === "add") return tapAdd(ctx, rest);
  if (sub === "remove") return tapRemove(ctx, rest);
  if (sub === "list") return tapList(ctx);
  if (sub === "update") return tapUpdate(ctx, rest);
  // Shorthand: `crew tap <ref> [<name>]` → `crew tap add <ref> [<name>]`.
  // Only dispatch when the first positional parses as a git source or a
  // path; bare words (subcommand typos) fall through to the usage error.
  if (sub && looksLikeTapSource(sub, ctx.cwd)) {
    return tapAdd(ctx, ctx.positional);
  }
  throw new CrewError(
    "usage_error",
    "`crew tap` takes one of: `<source> [<name>]`, `add <source> [<name>]`, `remove <name>`, `update [<name>]`, or `list`",
  );
}

/** True if `ref` parses as a git or path source (anything but a tap-name reference). */
function looksLikeTapSource(ref: string, cwd: string): boolean {
  try {
    const t = parseRef(ref, cwd).type;
    return t === "git" || t === "path";
  } catch {
    return false;
  }
}

/** Parsed source of a `tap add` argument: git or path. */
interface TapAddTarget {
  readonly kind: "git" | "path";
  readonly url: string;
  readonly subpath: string;
  readonly path: string;
}

function tapAdd(ctx: CommandContext, args: readonly string[]): CommandOutput {
  if (args.length < 1)
    throw new CrewError(
      "usage_error",
      "`crew tap add` needs a git URL or local path — e.g. `crew tap add https://github.com/acme/skills.git acme`",
    );
  const rawArg = args[0]!;
  const target = parseTapAddTarget(rawArg, ctx.cwd);
  const explicitName = args[1];
  const derivedName =
    target.kind === "git"
      ? deriveAutoTapName(target.url, target.subpath)
      : (target.path.split("/").filter(Boolean).pop() ?? "local");
  const name = explicitName ?? derivedName;
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new CrewError(
      "usage_error",
      `tap name \`${name}\` has invalid characters — use lowercase letters, digits, and hyphens only (starting with a letter)`,
      { name },
    );
  }
  type Outcome = "added" | "no-op" | "promoted";
  // Wrap in an object so TS doesn't narrow the literal type via the
  // initial assignment — `withStateLock`'s callback assigns later but
  // TS doesn't trace control flow into closures.
  const out: { value: Outcome } = { value: "added" };
  withStateLock(() => {
    const config = readConfig(ctx.home);
    // Same target already configured? Either no-op (registered) or promote (auto).
    const sameTarget = config.taps.find((t) => sameTap(t, target));
    if (sameTarget) {
      if (
        sameTarget.registered &&
        (explicitName === undefined || explicitName === sameTarget.name)
      ) {
        out.value = "no-op";
        return;
      }
      // Promote (and possibly rename).
      const renamedName = explicitName ?? sameTarget.name;
      const promoted: TapConfig = { ...sameTarget, registered: true, name: renamedName };
      const updated = {
        ...config,
        taps: config.taps.map((t) => (t.name === sameTarget.name ? promoted : t)),
      };
      // Rename the clone dir on disk if the name changed.
      if (renamedName !== sameTarget.name && target.kind === "git") {
        const oldPath = tapPath(sameTarget.name, ctx.home);
        const newPath = tapPath(renamedName, ctx.home);
        if (exists(oldPath)) {
          require("node:fs").renameSync(oldPath, newPath);
        }
      }
      writeConfig(updated, ctx.home);
      out.value = "promoted";
      return;
    }
    // Same name, different target → conflict.
    const sameName = config.taps.find((t) => t.name === name);
    if (sameName) {
      throw new CrewError(
        "usage_error",
        `tap \`${name}\` is already configured at \`${displayTarget(sameName)}\` — to add this one under a different name, run \`crew tap add ${rawArg} <tap-name>\``,
        {
          name,
          existing: displayTarget(sameName),
          incoming: displayTargetOf(target),
        },
      );
    }
    // Brand-new tap. For git taps, clone first; for path taps, just verify the dir exists.
    if (target.kind === "git") {
      const cloneDir = tapPath(name, ctx.home);
      try {
        ensureClone(target.url, cloneDir);
      } catch (err) {
        if (exists(cloneDir)) rmrf(cloneDir);
        throw err;
      }
    } else if (!isDirectory(target.path)) {
      throw new CrewError(
        "usage_error",
        `\`${target.path}\` isn't a directory — \`crew tap add\` needs an existing local path`,
        { path: target.path },
      );
    }
    const newTap: TapConfig = {
      name,
      kind: target.kind,
      registered: true,
      url: target.url,
      subpath: target.subpath,
      path: target.path,
    };
    writeConfig({ ...config, taps: [...config.taps, newTap] }, ctx.home);
  }, ctx.home);
  const targetStr = displayTargetOf(target);
  if (out.value === "no-op") {
    return {
      exitCode: 0,
      human: [`tap ${name} is already configured at ${targetStr} — nothing to do`],
      json: { name, ...payloadOf(target), already: true },
    };
  }
  if (out.value === "promoted") {
    return {
      exitCode: 0,
      human: [`promoted auto tap to registered: ${name} → ${targetStr}`],
      json: { name, ...payloadOf(target), promoted: true },
    };
  }
  return {
    exitCode: 0,
    human: [`added tap ${name} → ${targetStr}`],
    json: { name, ...payloadOf(target) },
  };
}

/** Parse the first positional of `tap add` into a TapAddTarget. */
function parseTapAddTarget(raw: string, cwd: string): TapAddTarget {
  const source: Source = parseRef(raw, cwd);
  if (source.type === "tap") {
    throw new CrewError(
      "usage_error",
      `\`${raw}\` looks like a tap reference, not a source — \`crew tap add\` takes a git URL or local path (e.g. \`gh:owner/repo\` or \`./my-skills\`)`,
      { raw },
    );
  }
  if (source.type === "path") {
    return { kind: "path", url: "", subpath: "", path: source.path };
  }
  // Git: reject `@ref` (taps track default branch).
  if (source.ref !== null) {
    throw new CrewError(
      "usage_error",
      `\`${raw}\` carries a \`@${source.ref}\` tail — taps track the default branch and can't be pinned. Drop the \`@${source.ref}\` and try again.`,
      { raw, ref: source.ref },
    );
  }
  return { kind: "git", url: source.url, subpath: source.subpath, path: "" };
}

function sameTap(a: TapConfig, t: TapAddTarget): boolean {
  if (a.kind !== t.kind) return false;
  if (a.kind === "git") return a.url === t.url && a.subpath === t.subpath;
  return a.path === t.path;
}

function displayTarget(t: TapConfig): string {
  if (t.kind === "path") return t.path;
  return t.subpath.length > 0 ? `${t.url}//${t.subpath}` : t.url;
}

function displayTargetOf(t: TapAddTarget): string {
  if (t.kind === "path") return t.path;
  return t.subpath.length > 0 ? `${t.url}//${t.subpath}` : t.url;
}

function payloadOf(t: TapAddTarget): Record<string, string> {
  if (t.kind === "path") return { kind: "path", path: t.path };
  return { kind: "git", url: t.url, ...(t.subpath.length > 0 ? { subpath: t.subpath } : {}) };
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
    const tap = config.taps.find((t) => t.name === name);
    if (!tap) {
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
    if (tap.kind === "git") rmrf(tapPath(name, ctx.home));
    // Path taps don't own the directory; never delete it.
  }, ctx.home);
  return {
    exitCode: 0,
    human: [`removed tap ${name}`],
    json: { name },
  };
}

/**
 * `crew tap update [<name>]` — fetch + fast-forward one or every git tap.
 * Path taps are silently skipped (no upstream to fetch).
 */
function tapUpdate(ctx: CommandContext, args: readonly string[]): CommandOutput {
  const config = readConfig(ctx.home);
  const selected: readonly TapConfig[] =
    args.length === 0 ? config.taps : tapsMatching(config.taps, args);
  const rows: TapRefreshRow[] = refreshTaps(selected, ctx.home);
  const anyFailed = rows.some((r) => r.kind === "failed");
  const human = rows.map((r) =>
    r.kind === "refreshed"
      ? `${r.name}: refreshed (${r.url})`
      : r.kind === "skipped"
        ? `${r.name}: skipped (${r.reason ?? "path tap"})`
        : `${r.name}: FAILED (${r.error?.code ?? "unknown"}) — ${r.error?.message ?? ""}`,
  );
  return {
    exitCode: anyFailed ? 1 : 0,
    human,
    json: { rows },
  };
}

/** Resolve one-or-more tap names from positional args; unknowns are usage errors. */
function tapsMatching(all: readonly TapConfig[], names: readonly string[]): TapConfig[] {
  const out: TapConfig[] = [];
  for (const n of names) {
    const tap = all.find((t) => t.name === n);
    if (!tap) {
      throw new CrewError(
        "usage_error",
        `no tap named \`${n}\` is configured — run \`crew tap list\` to see what's there`,
        { name: n },
      );
    }
    out.push(tap);
  }
  return out;
}

function tapList(ctx: CommandContext): CommandOutput {
  const config = readConfig(ctx.home);
  const rows = config.taps.map((t) => {
    let lastFetched: string | null = null;
    if (t.kind === "git") {
      const p = tapPath(t.name, ctx.home);
      try {
        lastFetched = new Date(statSync(p).mtimeMs).toISOString();
      } catch {
        lastFetched = null;
      }
    }
    return {
      name: t.name,
      kind: t.kind,
      registered: t.registered,
      target: displayTarget(t),
      last_fetched: lastFetched,
    };
  });
  const human = rows.map((r) => {
    const flag = r.registered ? "registered" : "auto";
    const fetched = r.kind === "git" ? `last_fetched=${r.last_fetched ?? "-"}` : "(path tap)";
    return `${r.name.padEnd(16)} ${flag.padEnd(11)} ${r.target.padEnd(60)} ${fetched}`;
  });
  return { exitCode: 0, human, json: { taps: rows } };
}
