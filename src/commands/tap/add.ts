/**
 * `crew tap add <url-or-path> [<name>]` (§16.3). Three outcomes:
 * *added* (new tap row; git taps clone first), *no-op* (same target
 * already configured as registered), *promoted* (same target already
 * backs an auto tap — see `./promote.ts`).
 */

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
import { promoteExistingTap } from "./promote.ts";

/** Parsed source of a `tap add` argument: git or path. */
interface TapAddTarget {
  readonly kind: "git" | "path";
  readonly url: string;
  readonly subpath: string;
  readonly path: string;
}

type Outcome = "added" | "no-op" | "promoted";

export function tapAdd(ctx: CommandContext, args: readonly string[]): CommandOutput {
  if (args.length < 1)
    throw new CrewError(
      "usage_error",
      "`crew tap add` needs a git URL or local path — e.g. `crew tap add https://github.com/acme/skills.git acme`",
    );
  const rawArg = args[0]!;
  const target = parseTapAddTarget(rawArg, ctx.cwd);
  const explicitName = args[1];
  const name = explicitName ?? deriveName(target);
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new CrewError(
      "usage_error",
      `tap name \`${name}\` has invalid characters — use lowercase letters, digits, and hyphens only (starting with a letter)`,
      { name },
    );
  }
  // Wrap in an object so TS doesn't narrow the literal type via the
  // initial assignment — `withStateLock`'s callback assigns later but
  // TS doesn't trace control flow into closures.
  const out: { value: Outcome } = { value: "added" };
  withStateLock(() => {
    out.value = performAdd(ctx, name, rawArg, explicitName, target);
  }, ctx.home);
  return formatOutcome(out.value, name, target);
}

/** The actual write-under-lock flow; returns the chosen outcome. */
function performAdd(
  ctx: CommandContext,
  name: string,
  rawArg: string,
  explicitName: string | undefined,
  target: TapAddTarget,
): Outcome {
  const config = readConfig(ctx.home);
  const sameTarget = config.taps.find((t) => sameTap(t, target));
  if (sameTarget) {
    if (sameTarget.registered && (explicitName === undefined || explicitName === sameTarget.name)) {
      return "no-op";
    }
    promoteExistingTap(ctx.home, ctx.cwd, config, sameTarget, target.kind, explicitName);
    return "promoted";
  }
  const sameName = config.taps.find((t) => t.name === name);
  if (sameName) {
    throw new CrewError(
      "usage_error",
      `tap \`${name}\` is already configured at \`${displayTarget(sameName)}\` — to add this one under a different name, run \`crew tap add ${rawArg} <tap-name>\``,
      { name, existing: displayTarget(sameName), incoming: displayTarget(target) },
    );
  }
  materializeNewTap(name, target, ctx.home);
  writeConfig({ ...config, taps: [...config.taps, newTapOf(name, target)] }, ctx.home);
  return "added";
}

function deriveName(target: TapAddTarget): string {
  if (target.kind === "git") return deriveAutoTapName(target.url, target.subpath);
  return target.path.split("/").filter(Boolean).pop() ?? "local";
}

/** Clone (git) or verify (path) the source backs a real directory. */
function materializeNewTap(name: string, target: TapAddTarget, home: string): void {
  if (target.kind === "git") {
    const cloneDir = tapPath(name, home);
    try {
      ensureClone(target.url, cloneDir);
    } catch (err) {
      if (exists(cloneDir)) rmrf(cloneDir);
      throw err;
    }
    return;
  }
  if (!isDirectory(target.path))
    throw new CrewError(
      "usage_error",
      `\`${target.path}\` isn't a directory — \`crew tap add\` needs an existing local path`,
      { path: target.path },
    );
}

function newTapOf(name: string, target: TapAddTarget): TapConfig {
  return {
    name,
    kind: target.kind,
    registered: true,
    url: target.url,
    subpath: target.subpath,
    path: target.path,
  };
}

function formatOutcome(outcome: Outcome, name: string, target: TapAddTarget): CommandOutput {
  const targetStr = displayTarget(target);
  const payload = { name, ...payloadOf(target) };
  if (outcome === "no-op")
    return {
      exitCode: 0,
      human: [`tap ${name} is already configured at ${targetStr} — nothing to do`],
      json: { ...payload, already: true },
    };
  if (outcome === "promoted")
    return {
      exitCode: 0,
      human: [`promoted auto tap to registered: ${name} → ${targetStr}`],
      json: { ...payload, promoted: true },
    };
  return { exitCode: 0, human: [`added tap ${name} → ${targetStr}`], json: payload };
}

function parseTapAddTarget(raw: string, cwd: string): TapAddTarget {
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

function sameTap(a: TapConfig, t: TapAddTarget): boolean {
  if (a.kind !== t.kind) return false;
  if (a.kind === "git") return a.url === t.url && a.subpath === t.subpath;
  return a.path === t.path;
}

export function displayTarget(t: TapConfig | TapAddTarget): string {
  if (t.kind === "path") return t.path;
  return t.subpath.length > 0 ? `${t.url}//${t.subpath}` : t.url;
}

function payloadOf(t: TapAddTarget): Record<string, string> {
  if (t.kind === "path") return { kind: "path", path: t.path };
  return { kind: "git", url: t.url, ...(t.subpath.length > 0 ? { subpath: t.subpath } : {}) };
}
