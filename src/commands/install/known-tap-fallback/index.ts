/**
 * Known-tap install miss guidance (§9 / §16.2.1).
 *
 * `crew install <name>` only installs from configured taps. When that
 * normal resolution misses, this module consults the bundled known-tap
 * registry and enriches the `invalid_ref` error with explicit tap-add
 * and install commands. It never clones, fetches, or mutates config.
 */

import { CrewError } from "../../../core/errors.ts";
import type { Config, Source, TapSource } from "../../../core/types.ts";
import type { KindHint } from "../../../install/resolve-ref/index.ts";
import { knownTapIsConfigured } from "../../../known-taps/configured.ts";
import { knownTapSource } from "../../../known-taps/format.ts";
import { getKnownTaps } from "../../../known-taps/registry.ts";
import type { KnownTap, KnownTapTrust } from "../../../known-taps/types.ts";
import { parseRef } from "../../../refs/parse.ts";
import { type KnownInstallSuggestion, knownMatchesForTap } from "./match.ts";

interface KnownInstallSuggestionJson {
  readonly tap: string;
  readonly url: string;
  readonly subpath: string;
  readonly trust: KnownTapTrust;
  readonly name: string | null;
  readonly namespace: string | null;
  readonly description: string;
  readonly tap_add: string;
  readonly install: string;
}

export function withKnownTapInstallSuggestions(
  err: CrewError,
  refs: readonly string[],
  config: Config,
  cwd: string,
  kindHint: KindHint,
): CrewError {
  if (err.code !== "invalid_ref") {
    return err;
  }
  const suggestions = knownInstallSuggestions(refs, config, cwd, kindHint);
  if (suggestions.length === 0) {
    return err;
  }
  return new CrewError("invalid_ref", renderKnownInstallError(err, suggestions), {
    ...err.details,
    known_tap_suggestions: suggestions.map(suggestionJson),
  });
}

function parseMaybeTap(raw: string, cwd: string): TapSource | null {
  let source: Source;
  try {
    source = parseRef(raw, cwd);
  } catch {
    return null;
  }
  return source.type === "tap" ? source : null;
}

function knownInstallSuggestions(
  refs: readonly string[],
  config: Config,
  cwd: string,
  kindHint: KindHint,
): KnownInstallSuggestion[] {
  const out: KnownInstallSuggestion[] = [];
  const seen = new Set<string>();
  for (const raw of refs) {
    const source = parseMaybeTap(raw, cwd);
    if (source === null) {
      continue;
    }
    for (const suggestion of knownSuggestionsForSource(source, config, kindHint)) {
      const key = `${suggestion.tap.name}/${suggestion.installRef}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push(suggestion);
    }
  }
  return out;
}

function knownSuggestionsForSource(
  source: TapSource,
  config: Config,
  kindHint: KindHint,
): KnownInstallSuggestion[] {
  const out: KnownInstallSuggestion[] = [];
  for (const tap of getKnownTaps()) {
    if (!knownTapIsConfigured(tap, config.taps)) {
      out.push(...filterKindHints(knownMatchesForTap(tap, source), kindHint));
    }
  }
  return out;
}

function filterKindHints(
  suggestions: readonly KnownInstallSuggestion[],
  kindHint: KindHint,
): KnownInstallSuggestion[] {
  if (kindHint === null) {
    return [...suggestions];
  }
  if (kindHint === "namespace") {
    return [];
  }
  const wantSkill = kindHint === "skill";
  return suggestions.filter((suggestion) => (suggestion.skill !== null) === wantSkill);
}

function renderKnownInstallError(
  err: CrewError,
  suggestions: readonly KnownInstallSuggestion[],
): string {
  const lines = [err.message, "", "Homecrew found possible matches in known taps:"];
  for (const suggestion of suggestions) {
    lines.push("");
    lines.push(`  ${suggestion.installRef} (${suggestion.tap.trust})`);
    lines.push(`    Add the tap:`);
    lines.push(`      ${tapAddCommand(suggestion.tap)}`);
    lines.push(`    Then install:`);
    lines.push(`      crew install ${suggestion.installRef}`);
  }
  return lines.join("\n");
}

function suggestionJson(suggestion: KnownInstallSuggestion): KnownInstallSuggestionJson {
  return {
    tap: suggestion.tap.name,
    url: suggestion.tap.url,
    subpath: suggestion.tap.subpath,
    trust: suggestion.tap.trust,
    name: suggestion.skill?.name ?? null,
    namespace: suggestion.skill?.namespace ?? null,
    description: suggestion.skill?.description ?? suggestion.tap.description,
    tap_add: tapAddCommand(suggestion.tap),
    install: `crew install ${suggestion.installRef}`,
  };
}

function tapAddCommand(tap: KnownTap): string {
  return `crew tap add ${knownTapSource(tap)} ${tap.name}`;
}
