/**
 * `crew search [--tap <name>] [<query>]` — search across configured taps (§16.6).
 *
 * With a query: match configured taps first, then show local
 * known-tap registry suggestions without cloning or mutating config.
 * Without a query: list the configured catalog.
 *
 * `--tap <name>` narrows both forms to one configured tap. Known-tap
 * suggestions are omitted in that case — the user asked about a tap
 * they already have, not about taps they could add.
 */

import { requireConfiguredTap } from "../../config/find-tap.ts";
import { readConfig } from "../../config/load.ts";
import type { TapConfig } from "../../core/types.ts";
import { readState } from "../../state/load.ts";
import type { CommandContext, CommandOutput } from "../types.ts";
import { collectConfiguredHits } from "./configured.ts";
import { buildSearchInstallIndex } from "./install-state.ts";
import { collectKnownHits } from "./known.ts";
import { formatSearchResults } from "./render.ts";

export function searchCommand(ctx: CommandContext): CommandOutput {
  const rawQuery = ctx.positional.join(" ");
  const query = rawQuery.toLowerCase();
  const config = readConfig(ctx.home);
  const state = readState(ctx.home);
  const installIndex = buildSearchInstallIndex(state);

  const tapFilter = readTapFilter(ctx, config.taps);
  const taps = tapFilter === null ? config.taps : [tapFilter];
  const { hits, warnings } = collectConfiguredHits(taps, query, installIndex, ctx.home);
  const knownHits = tapFilter === null ? collectKnownHits(query, config.taps) : [];
  const human = formatSearchResults(hits, knownHits, rawQuery, ctx.style, ctx.width);
  return {
    exitCode: 0,
    human,
    stderr: warnings,
    json: { tap: tapFilter?.name ?? null, hits, known_hits: knownHits, warnings },
  };
}

/** Resolve `--tap <name>` to a configured tap, or null when the flag is absent. */
function readTapFilter(ctx: CommandContext, taps: readonly TapConfig[]): TapConfig | null {
  const raw = ctx.flags.extras["tap"];
  if (typeof raw !== "string") return null;
  return requireConfiguredTap(taps, raw);
}
