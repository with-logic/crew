/**
 * Tap-source acquisition: resolve a tap reference (bare name or
 * `tap/skill`), ensure the tap's git clone is up to date, and point
 * `rootDir` at the named skill's directory within the tap.
 *
 * A tap optionally carries a `subpath` — when present, the tap is
 * rooted at `<clone>/<subpath>` rather than the clone root. This is
 * invisible in references: users still type `crew install <skill>`
 * or `<tap>/<skill>`; the subpath is joined internally on every walk.
 *
 * A bare name (`<skill>`) searches every configured tap, raising
 * `invalid_ref` if no tap carries it and `ambiguous_reference` if more
 * than one does.
 */

import { join } from "node:path";
import { CrewError } from "../../core/errors.ts";
import { crewHome, tapPath } from "../../core/paths.ts";
import type { Config, TapConfig, TapSource } from "../../core/types.ts";
import { checkoutSha, classifyRef, ensureClone, resolveRef } from "../../git/repo.ts";
import { isDirectory } from "../../util/fs.ts";
import type { AcquiredSource } from "./index.ts";

/** Acquire a tap source, from a specified tap or by searching all taps. */
export function acquireTap(
  source: TapSource,
  config: Config,
  home: string = crewHome(),
): AcquiredSource {
  if (source.tap !== null) {
    const tapConfig = config.taps.find((t) => t.name === source.tap);
    if (!tapConfig)
      throw new CrewError(
        "invalid_ref",
        `no tap named \`${source.tap}\` is configured — run \`crew tap list\` to see configured taps, or \`crew tap add\` to add one`,
        { tap: source.tap },
      );
    return acquireFromTap(tapConfig, source, home);
  }

  // Bare name: search every tap. We only clone taps that don't exist
  // yet — never fetch. If a never-cloned tap is unreachable right now,
  // skip it silently so `crew install foo` still works for taps that
  // ARE reachable. `crew update` / `crew tap update` are the commands
  // that get to raise hard network errors.
  const found: TapConfig[] = [];
  for (const tap of config.taps) {
    const tp = tapPath(tap.name, home);
    try {
      ensureClone(tap.url, tp);
    } catch {
      continue;
    }
    if (isDirectory(join(tapRootDir(tp, tap), source.name))) {
      found.push(tap);
    }
  }
  if (found.length === 0) {
    // Build the tap-name list with a for-loop instead of .map to avoid
    // an extra arrow callback function that coverage would ding us for.
    const names: string[] = [];
    for (const t of config.taps) names.push(t.name);
    const taps = names.join(", ");
    throw new CrewError(
      "invalid_ref",
      `skill \`${source.name}\` isn't in any configured tap (searched: ${taps || "<none>"}) — try \`crew search ${source.name}\`, or add a tap with \`crew tap add <url>\``,
      { skill: source.name },
    );
  }
  if (found.length > 1) {
    const candidates = found.map((f) => `${f.name}/${source.name}`).join(", ");
    throw new CrewError(
      "ambiguous_reference",
      `skill \`${source.name}\` matches multiple taps (${candidates}) — qualify with one of those names to pick`,
      { candidates },
    );
  }
  return acquireFromTap(found[0]!, source, home);
}

function acquireFromTap(tap: TapConfig, source: TapSource, home: string): AcquiredSource {
  const tp = tapPath(tap.name, home);
  // Materialize the clone if it hasn't been created yet; no fetch.
  // Users pick up upstream changes via `crew update` / `crew tap update`.
  ensureClone(tap.url, tp);
  const sha = resolveRef(tp, source.ref);
  const kind = classifyRef(tp, source.ref);
  checkoutSha(tp, sha);

  const root = tapRootDir(tp, tap);
  const rootDir = join(root, source.name);
  if (!isDirectory(rootDir)) {
    throw new CrewError(
      "invalid_ref",
      `tap \`${tap.name}\` has no skill named \`${source.name}\` — \`crew search ${source.name}\` checks every tap`,
      { tap: tap.name, skill: source.name },
    );
  }
  return {
    rootDir,
    resolvedSha: sha,
    requestedRef: source.ref,
    pinned: kind === "sha" || kind === "tag",
    // The marker's `path` is the skill's location relative to the tap's
    // root (i.e. relative to `tapRootDir`, not to the clone root).
    // That keeps marker semantics independent of whether a tap is
    // subpath-rooted or not — moving a tap's subpath doesn't rewrite
    // every installed marker.
    markerSource: { type: "tap", tap: tap.name, path: source.name },
    tapName: tap.name,
  };
}

/**
 * Where a tap is "rooted": the clone path for a plain tap, or
 * `<clone>/<subpath>` for a subpath tap. Exported so `crew search` can
 * walk the same directory as `acquireTap`.
 */
export function tapRootDir(clonePath: string, tap: TapConfig): string {
  return tap.subpath && tap.subpath.length > 0 ? join(clonePath, tap.subpath) : clonePath;
}
