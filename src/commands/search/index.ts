/**
 * `crew search [<query>]` — search across configured taps (§16.6).
 *
 * With a query: match configured taps first, then show local
 * known-tap registry suggestions without cloning or mutating config.
 * Without a query: list the configured catalog.
 */

import { readConfig } from "../../config/load.ts";
import { readState } from "../../state/load.ts";
import type { CommandContext, CommandOutput } from "../types.ts";
import { collectConfiguredHits } from "./configured.ts";
import { collectKnownHits } from "./known.ts";
import { formatSearchResults } from "./render.ts";

export function searchCommand(ctx: CommandContext): CommandOutput {
  const rawQuery = ctx.positional.join(" ");
  const query = rawQuery.toLowerCase();
  const config = readConfig(ctx.home);
  const state = readState(ctx.home);
  const installedNames = new Set(state.installations.map((i) => i.name));

  const { hits, warnings } = collectConfiguredHits(config.taps, query, installedNames, ctx.home);
  const knownHits = collectKnownHits(query, config.taps);
  const human = formatSearchResults(hits, knownHits, rawQuery, ctx.style, ctx.width);
  return {
    exitCode: 0,
    human,
    stderr: warnings,
    json: { hits, known_hits: knownHits, warnings },
  };
}
