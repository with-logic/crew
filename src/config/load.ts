/**
 * Read, normalize, and write `~/.crew/config.yaml` (§6.1).
 *
 * Rules:
 *   - A missing config file → return the defaults.
 *   - A present-but-unparseable config → throw `config_invalid` (exit 4).
 *   - Missing fields → filled from `defaultConfig()`.
 *   - The default `core` tap is always re-added if absent, unless explicitly
 *     removed via `crew tap remove core --force` which persists an empty-tap
 *     configuration. We preserve exactly what's on disk: the `core` tap is
 *     "always present unless explicitly removed."
 */

import { CrewError } from "../core/errors.ts";
import { crewHome, paths } from "../core/paths.ts";
import type { Config, TapConfig } from "../core/types.ts";
import { exists, readText, writeText } from "../util/fs.ts";
import { parseYaml, stringifyYaml, type YamlMap, type YamlValue } from "../yaml/parse.ts";
import { DEFAULT_AUTOUPDATE_INTERVAL_SECONDS, defaultConfig } from "./defaults.ts";
import { parseTapEntry, serializeTap } from "./taps.ts";

/** Read and normalize the config, or return defaults if absent. */
export function readConfig(home: string = crewHome()): Config {
  const configPath = paths(home).configFile;
  if (!exists(configPath)) {
    return defaultConfig();
  }
  let parsed: YamlValue;
  try {
    parsed = parseYaml(readText(configPath));
  } catch (err) {
    throw new CrewError(
      "config_invalid",
      `~/.crew/config.yaml isn't valid YAML — ${(err as Error).message}`,
    );
  }
  return normalizeConfig(parsed);
}

/** Normalize a parsed YAML value into a `Config`, filling defaults. */
export function normalizeConfig(parsed: YamlValue): Config {
  if (parsed === null || parsed === undefined) {
    return defaultConfig();
  }
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CrewError(
      "config_invalid",
      "~/.crew/config.yaml must be a YAML mapping at the top level",
    );
  }
  const map = parsed as YamlMap;

  const taps: TapConfig[] = [];
  const rawTaps = map["taps"];
  if (rawTaps === undefined || rawTaps === null) {
    taps.push(...defaultConfig().taps);
  } else {
    if (!Array.isArray(rawTaps)) {
      throw new CrewError("config_invalid", "config.yaml: `taps` must be a list of tap entries");
    }
    for (const entry of rawTaps) {
      taps.push(parseTapEntry(entry));
    }
  }

  const disabled_agents = readStringList(map, "disabled_agents");
  const forced_agents = readStringList(map, "forced_agents");
  const autoupdate = parseAutoupdate(map["autoupdate"]);

  return {
    taps,
    disabled_agents,
    forced_agents,
    autoupdate,
  };
}

function parseAutoupdate(raw: YamlValue | undefined): {
  enabled: boolean;
  interval_seconds: number;
} {
  let enabled = false;
  let interval_seconds = DEFAULT_AUTOUPDATE_INTERVAL_SECONDS;
  if (raw === undefined || raw === null) return { enabled, interval_seconds };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new CrewError(
      "config_invalid",
      "config.yaml: `autoupdate` must be a mapping with `enabled` and `interval_seconds`",
    );
  }
  const au = raw as YamlMap;
  if (au["enabled"] !== undefined && au["enabled"] !== null) {
    if (typeof au["enabled"] !== "boolean") {
      throw new CrewError(
        "config_invalid",
        "config.yaml: `autoupdate.enabled` must be `true` or `false`",
      );
    }
    enabled = au["enabled"];
  }
  if (au["interval_seconds"] !== undefined && au["interval_seconds"] !== null) {
    if (typeof au["interval_seconds"] !== "number" || au["interval_seconds"] <= 0) {
      throw new CrewError(
        "config_invalid",
        "config.yaml: `autoupdate.interval_seconds` must be a positive number (seconds between autoupdate runs)",
      );
    }
    interval_seconds = au["interval_seconds"];
  }
  return { enabled, interval_seconds };
}

function readStringList(map: YamlMap, key: string): string[] {
  const raw = map[key];
  if (raw === undefined || raw === null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new CrewError(
      "config_invalid",
      `config.yaml: \`${key}\` must be a list of agent names (or omitted)`,
    );
  }
  const result: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || item.length === 0) {
      throw new CrewError(
        "config_invalid",
        `config.yaml: each entry in \`${key}\` must be a non-empty agent name (e.g. \`claude-code\`)`,
      );
    }
    result.push(item);
  }
  return result;
}

/** Write a config to disk as YAML. */
export function writeConfig(config: Config, home: string = crewHome()): void {
  const obj: YamlValue = {
    taps: config.taps.map((t) => serializeTap(t)),
    disabled_agents: [...config.disabled_agents],
    forced_agents: [...config.forced_agents],
    autoupdate: {
      enabled: config.autoupdate.enabled,
      interval_seconds: config.autoupdate.interval_seconds,
    },
  };
  writeText(paths(home).configFile, stringifyYaml(obj));
}
