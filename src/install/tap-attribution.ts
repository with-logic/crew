/**
 * Map a parsed reference to the tap that should own its skills.
 *
 * Every install attributes each resolved skill to exactly one tap
 * (§16.5). For:
 *
 *   - bare-name / qualified tap refs: look up the configured tap by
 *     name (or search across all taps for a bare name's owning tap).
 *     Never creates a new tap.
 *   - git URL refs: find a configured tap (registered or auto) whose
 *     URL+subpath match. If none, create a new auto tap with a unique
 *     derived name. The new tap is appended to the in-memory config;
 *     the caller is responsible for persisting it.
 *   - path refs: same as git but `kind: path`.
 *
 * Returns the tap config plus a flag saying whether a new tap was
 * created (so the caller knows to write config.yaml back).
 */

import type { Config, GitSource, PathSource, TapConfig, TapDiscovery } from "../core/types.ts";
import { deriveAutoTapName } from "./tap-naming.ts";

export interface TapAttribution {
  /** The tap that owns this install's skills. */
  readonly tap: TapConfig;
  /** True when we created a new auto tap; the caller must write config back. */
  readonly created: boolean;
  /** The (possibly extended) config that includes the new tap. */
  readonly config: Config;
}

/**
 * Resolve a git or path ref to its owning tap, creating an auto-tap if
 * needed. Tap-typed refs are resolved by `enqueueTapRef` in
 * `resolve.ts`, not here — they don't need an auto-tap (they reference
 * a tap by name).
 */
export function attributeRef(
  source: GitSource | PathSource,
  config: Config,
  discovery?: TapDiscovery,
): TapAttribution {
  if (source.type === "git") return findOrCreateGitTap(source, config, discovery);
  return findOrCreatePathTap(source, config, discovery);
}

function findOrCreateGitTap(
  source: GitSource,
  config: Config,
  discovery: TapDiscovery | undefined,
): TapAttribution {
  const existing = config.taps.find(
    (t) => t.kind === "git" && t.url === source.url && t.subpath === source.subpath,
  );
  if (existing) return maybeUpgradeDiscovery(existing, config, discovery);
  const name = uniqueAutoName(deriveAutoTapName(source.url, source.subpath), config);
  const tap: TapConfig = {
    name,
    kind: "git",
    registered: false,
    url: source.url,
    subpath: source.subpath,
    path: "",
    ...(discovery === "recursive" ? { discovery } : {}),
  };
  return { tap, created: true, config: { ...config, taps: [...config.taps, tap] } };
}

function findOrCreatePathTap(
  source: PathSource,
  config: Config,
  discovery: TapDiscovery | undefined,
): TapAttribution {
  const existing = config.taps.find((t) => t.kind === "path" && t.path === source.path);
  if (existing) return maybeUpgradeDiscovery(existing, config, discovery);
  const last = source.path.split("/").filter(Boolean).pop() ?? "local";
  const name = uniqueAutoName(last, config);
  const tap: TapConfig = {
    name,
    kind: "path",
    registered: false,
    url: "",
    subpath: "",
    path: source.path,
    ...(discovery === "recursive" ? { discovery } : {}),
  };
  return { tap, created: true, config: { ...config, taps: [...config.taps, tap] } };
}

function maybeUpgradeDiscovery(
  tap: TapConfig,
  config: Config,
  discovery: TapDiscovery | undefined,
): TapAttribution {
  if (discovery !== "recursive" || tap.discovery === "recursive") {
    return { tap, created: false, config };
  }
  const upgraded: TapConfig = { ...tap, discovery: "recursive" };
  return {
    tap: upgraded,
    created: false,
    config: { ...config, taps: config.taps.map((t) => (t.name === tap.name ? upgraded : t)) },
  };
}

/** Append `-2`, `-3`, ... until the name doesn't collide with an existing tap. */
function uniqueAutoName(base: string, config: Config): string {
  const existingNames = new Set(config.taps.map((t) => t.name));
  if (!existingNames.has(base)) return base;
  let i = 2;
  let candidate = `${base}-${i}`;
  while (existingNames.has(candidate)) {
    i++;
    candidate = `${base}-${i}`;
  }
  return candidate;
}
