/**
 * Whether a parsed `.crew.json` holds every field crew records in a
 * marker, each of the right type (§7.5). `crew doctor` reads all of them
 * and `--repair` writes them into `config.yaml` and `state.json` (§11.2),
 * so a marker missing one is no marker it can use: check 9 reports it.
 */

import type { Marker } from "../core/types.ts";
import type { UncheckedMarker } from "./marker-read.ts";

const isString = (value: unknown): boolean => typeof value === "string";
const isStringOrNull = (value: unknown): boolean => value === null || typeof value === "string";

/** One test per marker field; `tap_discovery` alone may be absent (standard discovery). */
const FIELD_CHECKS: { readonly [K in keyof Marker]-?: (value: unknown) => boolean } = {
  schema_version: (value) => value === 1,
  name: isString,
  agents: (value) => Array.isArray(value) && value.every(isString),
  tap_name: isString,
  tap_kind: (value) => value === "git" || value === "path",
  tap_url: isString,
  tap_subpath: isString,
  tap_path: isString,
  tap_discovery: (value) => value === undefined || value === "recursive",
  path: isString,
  ref: isStringOrNull,
  resolved_sha: isStringOrNull,
  content_hash: isString,
  scope: (value) => value === "user" || value === "project",
  installed_at: isString,
  installed_by: isString,
};

/** The first field `marker` lacks or holds with the wrong type; null when it has them all. */
export function markerFieldProblem(marker: UncheckedMarker): string | null {
  for (const [field, ok] of Object.entries(FIELD_CHECKS)) {
    if (!ok(marker[field as keyof Marker])) return field;
  }
  return null;
}

/** True when `marker` holds every field crew records, each of the right type. */
export function isCompleteMarker(marker: UncheckedMarker): marker is Marker {
  return markerFieldProblem(marker) === null;
}
