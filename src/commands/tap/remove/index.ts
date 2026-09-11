/**
 * `crew tap remove <name>` (§16.3), including the attached-skill guard.
 *
 * Removing a tap that still backs state entries would leave those
 * entries pointing at a tap that no longer exists, so the bare command
 * refuses and names the two ways forward:
 *
 *   - `--uninstall` removes the attached skills (via the §7.4 uninstall
 *     algorithm) and then the tap;
 *   - `--force` drops the tap and keeps the skills, which then report
 *     `tap_missing` on `crew update` (§10.1).
 *
 * The default-tap guard (§16.2) is evaluated first, so `core` still
 * needs `--force` regardless of what's attached.
 */

import { DEFAULT_TAP_NAME } from "../../../config/defaults.ts";
import { readConfig, writeConfig } from "../../../config/load.ts";
import { CrewError } from "../../../core/errors.ts";
import { tapPath } from "../../../core/paths.ts";
import type { StateEntry, StateFile, TapConfig } from "../../../core/types.ts";
import { readState, writeState } from "../../../state/load.ts";
import { withStateLock } from "../../../state/lock.ts";
import { rmrf } from "../../../util/fs.ts";
import type { CommandContext, CommandOutput } from "../../types.ts";
import { removeOne, type UninstallRecord } from "../../uninstall/core.ts";
import { renderTapRemove } from "./render.ts";

/** Entry point for `crew tap remove` / `crew untap`. */
export function tapRemove(ctx: CommandContext, args: readonly string[]): CommandOutput {
  if (ctx.flags.extras["recursive"])
    throw new CrewError("usage_error", "`--recursive` only applies to `crew tap add`");
  if (args.length !== 1)
    throw new CrewError(
      "usage_error",
      "`crew tap remove` needs exactly one tap name — see `crew tap list`",
    );
  const name = args[0]!;
  const dryRun = ctx.flags.dryRun;
  const uninstall = Boolean(ctx.flags.extras["uninstall"]);

  const config = readConfig(ctx.home);
  const tap = tapToRemove(config.taps, name, ctx.flags.force);
  const attached = attachedEntries(readState(ctx.home), name);
  // `--uninstall` wins over `--force`: nothing is left to keep.
  if (attached.length > 0 && !(uninstall || ctx.flags.force)) throw attachedError(name, attached);

  if (uninstall && attached.length > 0) return removeWithSkills(ctx, tap, attached, dryRun);
  return removeTapOnly(ctx, tap, ctx.flags.force ? attached : [], dryRun);
}

/** Look up the tap to remove; unknown names and the unforced default tap are usage errors. */
export function tapToRemove(taps: readonly TapConfig[], name: string, force: boolean): TapConfig {
  const tap = taps.find((t) => t.name === name);
  if (!tap) {
    throw new CrewError(
      "usage_error",
      `\`${name}\` was not found in your list of taps.`,
      { name },
      "This may have been a typo. View your configured taps with `crew tap list`.",
    );
  }
  if (name === DEFAULT_TAP_NAME && !force)
    throw new CrewError(
      "usage_error",
      `\`${DEFAULT_TAP_NAME}\` is the default tap — pass \`--force\` if you're sure you want to remove it`,
    );
  return tap;
}

/** Every state entry, at any scope, attributed to `tapName`. */
export function attachedEntries(state: StateFile, tapName: string): readonly StateEntry[] {
  return state.installations.filter((e) => e.source.tap === tapName);
}

/** A short `<name> (<scope>)` label per attached entry, for messages. */
function describe(entries: readonly StateEntry[]): string[] {
  return entries.map((e) => `${e.name} (${e.scope})`);
}

function attachedError(name: string, attached: readonly StateEntry[]): CrewError {
  const labels = describe(attached);
  return new CrewError(
    "usage_error",
    `\`${name}\` still has ${labels.length === 1 ? "a skill" : "skills"} installed from it: ${labels.join(", ")}`,
    { name, attached: labels },
    `Run \`crew tap remove --uninstall ${name}\` to remove ${labels.length === 1 ? "it" : "them"} too, or \`crew tap remove --force ${name}\` to drop the tap and keep ${labels.length === 1 ? "it" : "them"} installed.`,
  );
}

/** Drop the tap row and its clone. Caller holds the state lock. */
function dropTap(home: string, tap: TapConfig): void {
  const config = readConfig(home);
  writeConfig({ ...config, taps: config.taps.filter((t) => t.name !== tap.name) }, home);
  // Path taps don't own their directory; never delete it.
  if (tap.kind === "git") rmrf(tapPath(tap.name, home));
}

/** `--force` (or nothing attached): remove the tap, keep any installs. */
function removeTapOnly(
  ctx: CommandContext,
  tap: TapConfig,
  kept: readonly StateEntry[],
  dryRun: boolean,
): CommandOutput {
  if (!dryRun) withStateLock(() => dropTap(ctx.home, tap), ctx.home);
  const keptLabels = describe(kept);
  return {
    exitCode: 0,
    human: renderTapRemove({
      name: tap.name,
      kind: tap.kind,
      dryRun,
      tapRemoved: true,
      kept: keptLabels,
      style: ctx.style,
    }),
    json: {
      name: tap.name,
      ...(keptLabels.length > 0 ? { kept: keptLabels } : {}),
      ...(dryRun ? { dry_run: true } : {}),
    },
  };
}

/** `--uninstall`: run the §7.4 removal for each attached entry, then drop the tap. */
function removeWithSkills(
  ctx: CommandContext,
  tap: TapConfig,
  attached: readonly StateEntry[],
  dryRun: boolean,
): CommandOutput {
  const records: UninstallRecord[] = [];
  const run = () => {
    let state = readState(ctx.home);
    // Names can repeat across scopes; `removeOne` handles every entry
    // of a name in one call, so visit each distinct name once.
    for (const name of new Set(attached.map((e) => e.name))) {
      const entries = state.installations.filter((e) => e.name === name);
      const { updatedState, rec } = removeOne(
        state,
        { raw: name, name, entries },
        ctx,
        false,
        null,
      );
      state = updatedState;
      records.push(rec);
    }
    if (dryRun) return;
    writeState(state, ctx.home);
    // Only drop the tap once every skill actually came off; a safety
    // abort leaves the tap in place so the user can retry with --force.
    if (records.every((r) => r.failures.length === 0)) dropTap(ctx.home, tap);
  };
  if (dryRun) run();
  else withStateLock(run, ctx.home);

  const failed = records.some((r) => r.failures.length > 0);
  return {
    exitCode: failed ? 1 : 0,
    human: renderTapRemove({
      name: tap.name,
      kind: tap.kind,
      dryRun,
      tapRemoved: !failed,
      kept: [],
      uninstalled: records,
      style: ctx.style,
    }),
    json: { name: tap.name, uninstalled: records, ...(dryRun ? { dry_run: true } : {}) },
  };
}
