/**
 * Thin wrapper over `js-yaml` exposing exactly the capabilities crew needs.
 *
 * `js-yaml` is the de-facto standard Node YAML library (used by Kubernetes,
 * GitHub Actions, Prettier, …). Wrapping it here gives us:
 *
 *   - a narrow `YamlValue` type that matches our domain (scalars, maps,
 *     lists — no anchors, no tags, no custom classes);
 *   - a single place to enforce "safe" parsing (`load`, not `loadAll`,
 *     and never constructing functions or regex from YAML);
 *   - one import site to update if we ever want to swap the library.
 */

import { dump, load, YAMLException } from "js-yaml";

/** The value kinds we accept. */
export type YamlValue = string | number | boolean | null | YamlValue[] | YamlMap;
export type YamlMap = { [key: string]: YamlValue };

/** Parse a YAML document. Throws on malformed input. */
export function parseYaml(source: string): YamlValue {
  // `load` already rejects multi-document input (use `loadAll` for that) and
  // in js-yaml v4 it uses the DEFAULT_SCHEMA which is safe (no !!js/function,
  // no !!js/regexp, no !!js/undefined).
  let value: unknown;
  try {
    value = load(source);
  } catch (err) {
    if (
      err instanceof YAMLException &&
      err.reason === "expected a document, but the input is empty"
    ) {
      return null;
    }
    throw err;
  }
  // js-yaml returns `undefined` for an empty document; we normalize to `null`
  // so callers never have to branch between the two (YAML itself treats them
  // the same — `~`, `null`, and an empty document all mean "no value").
  if (value === undefined) {
    return null;
  }
  return value as YamlValue;
}

/** Serialize a value as YAML with deterministic, readable output. */
export function stringifyYaml(value: YamlValue): string {
  return dump(value, {
    indent: 2,
    lineWidth: -1, // never fold long lines
    noRefs: true, // never emit `&` / `*` anchors
    sortKeys: false,
  });
}
