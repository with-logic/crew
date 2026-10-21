/**
 * Configured-tap search for `crew search` (§16.6).
 */

import { CrewError } from "../../core/errors.ts";
import type { TapConfig } from "../../core/types.ts";
import { indexTap, type SkillLocation } from "../../install/tap-index.ts";
import { displayText } from "../../refs/display-url.ts";
import { loadSkill } from "../../skill/load.ts";
import { sanitizeLine } from "../../util/redact.ts";
import { isSourceReadFailure } from "../../util/source-read.ts";
import { type SearchInstallIndex, searchInstallStatus } from "./install-state.ts";
import type { ConfiguredSearchResult, SearchHit } from "./types.ts";

export function collectConfiguredHits(
  taps: readonly TapConfig[],
  query: string,
  installIndex: SearchInstallIndex,
  home: string,
): ConfiguredSearchResult {
  const hits: SearchHit[] = [];
  const warnings: string[] = [];
  for (const tap of taps) collectHitsFromTap(tap, query, installIndex, home, hits, warnings);
  hits.sort(compareSearchHits);
  return { hits, warnings };
}

function collectHitsFromTap(
  tap: TapConfig,
  query: string,
  installIndex: SearchInstallIndex,
  home: string,
  hits: SearchHit[],
  warnings: string[],
): void {
  let index: ReturnType<typeof indexTap>;
  try {
    index = indexTap(tap, home);
  } catch (err) {
    // §16.6 makes an unreachable tap a warning, not a failure. A tap
    // whose stored subpath escapes its clone is a different matter:
    // reporting it as "couldn't be reached" would tell the user to
    // retry when online, which never fixes it. Name it for what it is.
    if (err instanceof CrewError && err.code === "invalid_ref") {
      warnings.push(`warning: tap \`${sanitizeLine(tap.name)}\` skipped — ${err.message}`);
      return;
    }
    // Source-file read failures carry their local path; acquisition failures do not.
    const isSourceReadFailure =
      err instanceof CrewError &&
      err.code === "source_unreachable" &&
      typeof err.details["path"] === "string";
    if (isSourceReadFailure) {
      warnings.push(
        `warning: tap \`${sanitizeLine(tap.name)}\` skipped (${err.code}) — ${displayText(err.message)}`,
      );
      return;
    }
    const displayedName = sanitizeLine(tap.name);
    const refreshCommand =
      displayedName === tap.name ? `crew tap update ${tap.name}` : "crew tap update";
    warnings.push(
      `warning: tap \`${displayedName}\` isn't cloned yet and couldn't be reached — skipping. run \`${refreshCommand}\` when you're back online.`,
    );
    return;
  }
  for (const skipped of index.skipped) {
    warnings.push(
      invalidManifestWarning({ tap: tap.name, path: skipped.path, message: skipped.message }),
    );
  }
  for (const locs of index.skills.values()) {
    for (const loc of locs) collectSkillHit(tap, loc, query, installIndex, hits, warnings);
  }
}

function collectSkillHit(
  tap: TapConfig,
  loc: SkillLocation,
  query: string,
  installIndex: SearchInstallIndex,
  hits: SearchHit[],
  warnings: string[],
): void {
  try {
    const { name, description } = loc.frontmatter ?? loadSkill(loc.path).frontmatter;
    if (!matchesSkill(name, description, query)) return;
    hits.push({
      tap: tap.name,
      name,
      namespace: loc.namespace,
      description,
      ...searchInstallStatus(installIndex, name, tap.name, loc.tapRelativePath),
    });
  } catch (err) {
    if (isSourceReadFailure(err))
      warnings.push(
        sanitizeLine(
          displayText(
            `warning: skill \`${loc.name}\` skipped (${err.code}) — ${err.message} (tap \`${tap.name}\`)`,
          ),
        ),
      );
    if (err instanceof CrewError && err.code === "invalid_skill")
      warnings.push(
        invalidManifestWarning({ tap: tap.name, path: loc.path, message: err.message }),
      );
  }
}

function invalidManifestWarning({
  tap,
  path,
  message,
}: {
  readonly tap: string;
  readonly path: string;
  readonly message: string;
}): string {
  return sanitizeLine(
    displayText(`warning: tap \`${tap}\` skill \`${path}\` skipped (invalid_skill) — ${message}`),
  );
}

function matchesSkill(name: string, description: string, query: string): boolean {
  return (
    query === "" || name.toLowerCase().includes(query) || description.toLowerCase().includes(query)
  );
}

function compareSearchHits(a: SearchHit, b: SearchHit): number {
  if (a.tap !== b.tap) return a.tap.localeCompare(b.tap);
  return a.name.localeCompare(b.name);
}
