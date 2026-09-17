/**
 * Guard evaluation for `crew tap remove` (§16.3).
 *
 * Resolving the tap and deciding what the run should do is pure over a
 * config/state snapshot, which is what lets a real run take those reads
 * inside the state lock while a `--dry-run` preview stays lock-free.
 */

import { DEFAULT_TAP_NAME } from "../../../config/defaults.ts";
import { CrewError } from "../../../core/errors.ts";
import type { StateEntry, StateFile, TapConfig } from "../../../core/types.ts";

/** What one `tap remove` run decided to do, computed from a consistent snapshot. */
export interface RemovePlan {
  readonly tap: TapConfig;
  /** Entries attributed to this tap, which `--uninstall` will remove. */
  readonly attached: readonly StateEntry[];
  /** True when the run should uninstall the attached skills first. */
  readonly uninstall: boolean;
}

/** Resolve the tap, apply both guards, and decide the flow. */
export function planRemove(args: {
  readonly taps: readonly TapConfig[];
  readonly state: StateFile;
  readonly name: string;
  readonly force: boolean;
  readonly uninstall: boolean;
}): RemovePlan {
  const tap = tapToRemove(args.taps, args.name, args.force);
  const attached = attachedEntries(args.state, args.name);
  // `--uninstall` wins over `--force`: nothing is left to keep.
  if (attached.length > 0 && !(args.uninstall || args.force))
    throw attachedError(args.name, attached);
  return { tap, attached, uninstall: args.uninstall && attached.length > 0 };
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
export function describe(entries: readonly StateEntry[]): string[] {
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
