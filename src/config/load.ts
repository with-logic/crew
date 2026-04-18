/**
 * Read, normalize, and write `~/.crew/config.yaml` (§6.1).
 *
 * Rules:
 *   - A missing config file → return the defaults.
 *   - A present-but-unparseable config → throw `config_invalid` (exit 4).
 *   - Missing fields → filled from `defaultConfig()`.
 *   - The default `core` tap is always re-added if absent, unless explicitly
 *     removed via `crew tap remove core --force` which persists an empty-tap
 *     configuration.  We preserve exactly what's on disk: the `core` tap is
 *     "always present unless explicitly removed."
 */

import { CrewError } from "../core/errors.ts";
import { crewHome, paths } from "../core/paths.ts";
import type { Config, TapConfig } from "../core/types.ts";
import { exists, readText, writeText } from "../util/fs.ts";
import { parseYaml, stringifyYaml, type YamlMap, type YamlValue } from "../yaml/parse.ts";
import {
  DEFAULT_AUTOUPDATE_INTERVAL_SECONDS,
  DEFAULT_TAP_NAME,
  DEFAULT_TAP_URL,
  defaultConfig,
} from "./defaults.ts";

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
    throw new CrewError("config_invalid", `config.yaml did not parse: ${(err as Error).message}`);
  }
  return normalizeConfig(parsed);
}

/** Normalize a parsed YAML value into a `Config`, filling defaults. */
export function normalizeConfig(parsed: YamlValue): Config {
  if (parsed === null || parsed === undefined) {
    return defaultConfig();
  }
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CrewError("config_invalid", "config.yaml must be a mapping");
  }
  const map = parsed as YamlMap;

  const taps: TapConfig[] = [];
  const rawTaps = map["taps"];
  if (rawTaps === undefined || rawTaps === null) {
    taps.push({ name: DEFAULT_TAP_NAME, url: DEFAULT_TAP_URL });
  } else {
    if (!Array.isArray(rawTaps)) {
      throw new CrewError("config_invalid", "config.yaml: `taps` must be a list");
    }
    for (const entry of rawTaps) {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        throw new CrewError("config_invalid", "config.yaml: every `taps` entry must be a mapping");
      }
      const em = entry as YamlMap;
      const name = em["name"];
      const url = em["url"];
      if (typeof name !== "string" || name.length === 0) {
        throw new CrewError("config_invalid", "config.yaml: tap `name` must be a non-empty string");
      }
      if (typeof url !== "string" || url.length === 0) {
        throw new CrewError("config_invalid", "config.yaml: tap `url` must be a non-empty string");
      }
      taps.push({ name, url });
    }
  }

  const disabled_targets = readStringList(map, "disabled_targets");
  const forced_targets = readStringList(map, "forced_targets");

  const autoupdate = map["autoupdate"];
  let enabled = false;
  let interval_seconds = DEFAULT_AUTOUPDATE_INTERVAL_SECONDS;
  if (autoupdate !== undefined && autoupdate !== null) {
    if (typeof autoupdate !== "object" || Array.isArray(autoupdate)) {
      throw new CrewError("config_invalid", "config.yaml: `autoupdate` must be a mapping");
    }
    const au = autoupdate as YamlMap;
    if (au["enabled"] !== undefined && au["enabled"] !== null) {
      if (typeof au["enabled"] !== "boolean") {
        throw new CrewError(
          "config_invalid",
          "config.yaml: `autoupdate.enabled` must be a boolean",
        );
      }
      enabled = au["enabled"];
    }
    if (au["interval_seconds"] !== undefined && au["interval_seconds"] !== null) {
      if (typeof au["interval_seconds"] !== "number" || au["interval_seconds"] <= 0) {
        throw new CrewError(
          "config_invalid",
          "config.yaml: `autoupdate.interval_seconds` must be a positive number",
        );
      }
      interval_seconds = au["interval_seconds"];
    }
  }

  return {
    taps,
    disabled_targets,
    forced_targets,
    autoupdate: { enabled, interval_seconds },
  };
}

function readStringList(map: YamlMap, key: string): string[] {
  const raw = map[key];
  if (raw === undefined || raw === null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new CrewError("config_invalid", `config.yaml: \`${key}\` must be a list`);
  }
  const result: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || item.length === 0) {
      throw new CrewError(
        "config_invalid",
        `config.yaml: every entry in \`${key}\` must be a non-empty string`,
      );
    }
    result.push(item);
  }
  return result;
}

/** Write a config to disk as YAML. */
export function writeConfig(config: Config, home: string = crewHome()): void {
  const obj: YamlValue = {
    taps: config.taps.map((t) => ({ name: t.name, url: t.url })),
    disabled_targets: [...config.disabled_targets],
    forced_targets: [...config.forced_targets],
    autoupdate: {
      enabled: config.autoupdate.enabled,
      interval_seconds: config.autoupdate.interval_seconds,
    },
  };
  writeText(paths(home).configFile, stringifyYaml(obj));
}
