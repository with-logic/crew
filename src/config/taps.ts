/**
 * Tap entry parsing and serialization for config.yaml (§6.1, §16).
 */

import { CrewError } from "../core/errors.ts";
import type { TapConfig, TapDiscovery, TapKind } from "../core/types.ts";
import type { YamlMap, YamlValue } from "../yaml/parse.ts";

/** Parse one entry under the top-level `taps:` list. */
export function parseTapEntry(entry: YamlValue): TapConfig {
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
      ? true
      : parseBool(em["registered"], "registered");
  const discovery = parseDiscovery(em["discovery"]);
  if (kind === "git") return parseGitTap(em, name, registered, discovery);
  return parsePathTap(em, name, registered, discovery);
}

/** Serialize a normalized tap entry back to YAML. */
export function serializeTap(t: TapConfig): YamlValue {
  if (t.kind === "git") {
    return {
      name: t.name,
      kind: "git",
      registered: t.registered,
      url: t.url,
      ...(t.subpath.length > 0 ? { subpath: t.subpath } : {}),
      ...(t.discovery === "recursive" ? { discovery: "recursive" } : {}),
    };
  }
  return {
    name: t.name,
    kind: "path",
    registered: t.registered,
    path: t.path,
    ...(t.discovery === "recursive" ? { discovery: "recursive" } : {}),
  };
}

function parseGitTap(
  em: YamlMap,
  name: string,
  registered: boolean,
  discovery: { discovery?: TapDiscovery },
): TapConfig {
  const url = em["url"];
  if (typeof url !== "string" || url.length === 0) {
    throw new CrewError(
      "config_invalid",
      `config.yaml: tap \`${name}\` (kind: git) needs a non-empty \`url\``,
    );
  }
  const subpath = parseSubpath(em["subpath"]);
  return { name, kind: "git", registered, url, subpath, path: "", ...discovery };
}

function parsePathTap(
  em: YamlMap,
  name: string,
  registered: boolean,
  discovery: { discovery?: TapDiscovery },
): TapConfig {
  const path = em["path"];
  if (typeof path !== "string" || path.length === 0) {
    throw new CrewError(
      "config_invalid",
      `config.yaml: tap \`${name}\` (kind: path) needs a non-empty \`path\``,
    );
  }
  return { name, kind: "path", registered, url: "", subpath: "", path, ...discovery };
}

function parseKind(raw: YamlValue | undefined): TapKind {
  if (raw === undefined || raw === null) return "git";
  if (raw === "git" || raw === "path") return raw;
  throw new CrewError(
    "config_invalid",
    "config.yaml: tap `kind`, when present, must be `git` or `path`",
  );
}

function parseBool(raw: YamlValue | undefined, field: string): boolean {
  if (typeof raw === "boolean") return raw;
  throw new CrewError(
    "config_invalid",
    `config.yaml: tap \`${field}\` must be \`true\` or \`false\``,
  );
}

function parseDiscovery(raw: YamlValue | undefined): { discovery?: TapDiscovery } {
  if (raw === undefined || raw === null || raw === "standard") return {};
  if (raw === "recursive") return { discovery: "recursive" };
  throw new CrewError(
    "config_invalid",
    "config.yaml: tap `discovery`, when present, must be `standard` or `recursive`",
  );
}

/** Subpath: optional string, normalized to no leading/trailing slashes; empty → empty string. */
function parseSubpath(raw: YamlValue | undefined): string {
  if (raw === undefined || raw === null) return "";
  if (typeof raw === "string") return raw.replace(/^\/+|\/+$/g, "");
  throw new CrewError(
    "config_invalid",
    "config.yaml: tap `subpath`, when present, must be a string (directory inside the repo)",
  );
}
