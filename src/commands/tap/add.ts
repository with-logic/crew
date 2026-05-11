/**
 * `crew tap add <url-or-path> [<name>]` (§16.3). Three outcomes:
 * *added* (new tap row; git taps clone first), *no-op* (same target
 * already configured as registered), *promoted* (same target already
 * backs an auto tap — see `./promote.ts`).
 */

import { readConfig, writeConfig } from "../../config/load.ts";
import { CrewError } from "../../core/errors.ts";
import { tapPath } from "../../core/paths.ts";
import type { TapConfig } from "../../core/types.ts";
import { ensureClone } from "../../git/repo.ts";
import { deriveAutoTapName } from "../../install/tap-naming.ts";
import { NAME_PATTERN } from "../../refs/parse.ts";
import { readState } from "../../state/load.ts";
import { withStateLock } from "../../state/lock.ts";
import { exists, isDirectory, rmrf } from "../../util/fs.ts";
import type { Styler } from "../../util/term.ts";
import type { CommandContext, CommandOutput } from "../types.ts";
import { promoteExistingTap } from "./promote.ts";
import { rewriteTapMarkers } from "./rewrite-markers.ts";
import {
  displayTarget,
  parseTapAddTarget,
  payloadOf,
  sameTap,
  type TapAddTarget,
} from "./target.ts";

type Outcome = "added" | "no-op" | "promoted" | "updated";

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
  const recursive = Boolean(ctx.flags.extras["recursive"]);
  if (!NAME_PATTERN.test(name)) {
    throw new CrewError(
      "usage_error",
      `tap name \`${name}\` has invalid characters — use lowercase letters, digits, and hyphens only (starting with an alphanumeric, not a hyphen)`,
      { name },
    );
  }
  // Wrap in an object so TS doesn't narrow the literal type via the
  // initial assignment — `withStateLock`'s callback assigns later but
  // TS doesn't trace control flow into closures.
  const out: { value: Outcome } = { value: "added" };
  withStateLock(() => {
    out.value = performAdd(ctx, name, rawArg, explicitName, target, recursive);
  }, ctx.home);
  return formatOutcome(out.value, name, target, ctx.style);
}

/** The actual write-under-lock flow; returns the chosen outcome. */
function performAdd(
  ctx: CommandContext,
  name: string,
  rawArg: string,
  explicitName: string | undefined,
  target: TapAddTarget,
  recursive: boolean,
): Outcome {
  const config = readConfig(ctx.home);
  const sameTarget = config.taps.find((t) => sameTap(t, target));
  if (sameTarget) {
    if (sameTarget.registered && (explicitName === undefined || explicitName === sameTarget.name)) {
      if (recursive && sameTarget.discovery !== "recursive") {
        writeConfig(
          {
            ...config,
            taps: config.taps.map((t) =>
              t.name === sameTarget.name ? { ...t, discovery: "recursive" } : t,
            ),
          },
          ctx.home,
        );
        rewriteTapMarkers(
          { oldName: sameTarget.name, newName: sameTarget.name, discovery: "recursive" },
          readState(ctx.home).installations,
          ctx.cwd,
        );
        return "updated";
      }
      return "no-op";
    }
    promoteExistingTap(ctx.home, ctx.cwd, config, sameTarget, target.kind, explicitName, recursive);
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
  writeConfig({ ...config, taps: [...config.taps, newTapOf(name, target, recursive)] }, ctx.home);
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

function newTapOf(name: string, target: TapAddTarget, recursive: boolean): TapConfig {
  return {
    name,
    kind: target.kind,
    registered: true,
    url: target.url,
    subpath: target.subpath,
    path: target.path,
    ...(recursive ? { discovery: "recursive" } : {}),
  };
}

function formatOutcome(
  outcome: Outcome,
  name: string,
  target: TapAddTarget,
  style: Styler,
): CommandOutput {
  const targetStr = displayTarget(target);
  const payload = { name, ...payloadOf(target) };
  if (outcome === "no-op") {
    return {
      exitCode: 0,
      human: [
        `${style.symbol("muted")} Tap ${style.bold(name)} is already set up`,
        style.dim(`  pointed at ${targetStr}`),
      ],
      json: { ...payload, already: true },
    };
  }
  if (outcome === "promoted") {
    return {
      exitCode: 0,
      human: [
        `${style.symbol("ok")} Promoted ${style.bold(name)} to a saved tap`,
        style.dim(`  now tracking ${targetStr}`),
      ],
      json: { ...payload, promoted: true },
    };
  }
  if (outcome === "updated") {
    return {
      exitCode: 0,
      human: [
        `${style.symbol("ok")} Updated tap ${style.bold(name)}`,
        style.dim(`  recursive discovery enabled for ${targetStr}`),
      ],
      json: { ...payload, updated: true },
    };
  }
  return {
    exitCode: 0,
    human: [
      `${style.symbol("ok")} Added tap ${style.bold(name)}`,
      style.dim(`  from ${targetStr}`),
      style.dim("  try `crew search <query>` or `crew install <name>` to use it"),
    ],
    json: payload,
  };
}
