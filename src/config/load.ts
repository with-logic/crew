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
import type { Config, TapConfig, TapKind } from "../core/types.ts";
import { exists, readText, writeText } from "../util/fs.ts";
import { parseYaml, stringifyYaml, type YamlMap, type YamlValue } from "../yaml/parse.ts";
import { DEFAULT_AUTOUPDATE_INTERVAL_SECONDS, defaultConfig } from "./defaults.ts";

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

  const disabled_targets = readStringList(map, "disabled_targets");
  const forced_targets = readStringList(map, "forced_targets");
  const autoupdate = parseAutoupdate(map["autoupdate"]);

  return {
    taps,
    disabled_targets,
    forced_targets,
    autoupdate,
  };
}

/** Parse one entry under the top-level `taps:` list. */
function parseTapEntry(entry: YamlValue): TapConfig {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    throw new CrewError(
      "config_invalid",
      "config.yaml: each `taps` entry must be a mapping like `- name: foo\\n  kind: git\\n  url: https://...`",
    );
  }
  const em = entry as YamlMap;
  const name = em["name"];
  if (typeof name !== "string" || name.length === 0) {
    throw new CrewError("config_invalid", "config.yaml: each tap needs a non-empty `name`");
  }
  const kind = parseKind(em["kind"]);
  const registered =
    em["registered"] === undefined || em["registered"] === null
      ? true // legacy/default: assume registered when not specified
      : parseBool(em["registered"], "registered");
  if (kind === "git") {
    const url = em["url"];
    if (typeof url !== "string" || url.length === 0) {
      throw new CrewError(
        "config_invalid",
        `config.yaml: tap \`${name}\` (kind: git) needs a non-empty \`url\``,
      );
    }
    const subpath = parseSubpath(em["subpath"]);
    return { name, kind: "git", registered, url, subpath, path: "" };
  }
  // kind === "path"
  const path = em["path"];
  if (typeof path !== "string" || path.length === 0) {
    throw new CrewError(
      "config_invalid",
      `config.yaml: tap \`${name}\` (kind: path) needs a non-empty \`path\``,
    );
  }
  return { name, kind: "path", registered, url: "", subpath: "", path };
}

function parseKind(raw: YamlValue | undefined): TapKind {
  if (raw === undefined || raw === null) return "git"; // legacy default
  if (raw === "git" || raw === "path") return raw;
  throw new CrewError(
    "config_invalid",
    "config.yaml: tap `kind`, when present, must be `git` or `path`",
  );
}

function parseBool(raw: YamlValue | undefined, field: string): boolean {
  if (typeof raw !== "boolean") {
    throw new CrewError(
      "config_invalid",
      `config.yaml: tap \`${field}\` must be \`true\` or \`false\``,
    );
  }
  return raw;
}

/** Subpath: optional string, normalized to no leading/trailing slashes; empty → empty string. */
function parseSubpath(raw: YamlValue | undefined): string {
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string") {
    throw new CrewError(
      "config_invalid",
      "config.yaml: tap `subpath`, when present, must be a string (directory inside the repo)",
    );
  }
  return raw.replace(/^\/+|\/+$/g, "");
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
      `config.yaml: \`${key}\` must be a list of target names (or omitted)`,
    );
  }
  const result: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || item.length === 0) {
      throw new CrewError(
        "config_invalid",
        `config.yaml: each entry in \`${key}\` must be a non-empty target name (e.g. \`claude-code\`)`,
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
    disabled_targets: [...config.disabled_targets],
    forced_targets: [...config.forced_targets],
    autoupdate: {
      enabled: config.autoupdate.enabled,
      interval_seconds: config.autoupdate.interval_seconds,
    },
  };
  writeText(paths(home).configFile, stringifyYaml(obj));
}

function serializeTap(t: TapConfig): YamlValue {
  if (t.kind === "git") {
    return {
      name: t.name,
      kind: "git",
      registered: t.registered,
      url: t.url,
      ...(t.subpath.length > 0 ? { subpath: t.subpath } : {}),
    };
  }
  return {
    name: t.name,
    kind: "path",
    registered: t.registered,
    path: t.path,
  };
}
