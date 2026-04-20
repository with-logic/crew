/**
 * `crew self-update` (§10.3).
 *
 * Two modes:
 *   - bare: fetch latest, download, replace, refresh version-check.
 *   - `--check`: fetch latest, refresh version-check, print the result.
 *     Makes no filesystem changes beyond writing `version-check.json`.
 *
 * `--version <tag>` installs a named tag instead of the latest.
 * `--force` reinstalls even when already on the latest version.
 */

import { runSelfUpdate, runSelfUpdateCheck } from "../self-update/upgrade.ts";
import type { CommandContext, CommandOutput } from "./types.ts";

export function selfUpdateCommand(ctx: CommandContext): CommandOutput {
  const check = Boolean(ctx.flags.extras["check"]);
  const tag = firstString(ctx.flags.extras["version"]);

  if (check) {
    return doCheck(ctx, tag);
  }
  return doUpgrade(ctx, tag);
}

function doCheck(ctx: CommandContext, tag: string | undefined): CommandOutput {
  const { currentVersion, latestTag } = runSelfUpdateCheck(ctx.home, tag);
  const uptodate = normalizeTag(currentVersion) === normalizeTag(latestTag);
  const human = uptodate
    ? [`${ctx.style.symbol("ok")} ${ctx.style.bold(`You're on ${currentVersion} — the latest.`)}`]
    : [
        `${ctx.style.symbol("warn")} ${ctx.style.bold(`A newer crew is available: ${currentVersion} → ${latestTag}`)}`,
        ctx.style.dim("  Run `crew self-update` to upgrade."),
      ];
  return {
    exitCode: 0,
    human,
    json: {
      current_version: currentVersion,
      latest_tag: latestTag,
      update_available: !uptodate,
    },
  };
}

function doUpgrade(ctx: CommandContext, tag: string | undefined): CommandOutput {
  const result = runSelfUpdate({
    home: ctx.home,
    ...(tag === undefined ? {} : { tag }),
    force: ctx.flags.force,
  });
  if (!result.replaced) {
    return {
      exitCode: 0,
      human: [
        `${ctx.style.symbol("ok")} ${ctx.style.bold(`Already on ${result.currentVersion} — the latest.`)}`,
        ctx.style.dim("  Run with `--force` to reinstall anyway."),
      ],
      json: {
        current_version: result.currentVersion,
        latest_tag: result.latestTag,
        replaced: false,
      },
    };
  }
  return {
    exitCode: 0,
    human: [
      `${ctx.style.symbol("ok")} ${ctx.style.bold(`Upgraded crew: ${result.currentVersion} → ${result.latestTag}`)}`,
      ctx.style.dim("  The new version takes effect on your next `crew` invocation."),
    ],
    json: {
      current_version: result.currentVersion,
      latest_tag: result.latestTag,
      replaced: true,
    },
  };
}

function firstString(v: string | boolean | undefined): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function normalizeTag(tag: string): string {
  return tag.startsWith("v") ? tag.slice(1) : tag;
}
