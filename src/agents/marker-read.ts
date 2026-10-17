/**
 * Reading the crew marker in an install folder (§7.5, §11.1). A path that
 * can't hold a marker names nothing. `readMarkerAt` also reports a marker
 * crew can't parse as `none`, and one it can't read as `unreadable`: that
 * marker might name any tap, so a caller deciding whether a tap is still
 * named — auto-tap collection, say — must treat it as naming one.
 * `inspectMarkerAt` is the same reading with the reasons kept, for a
 * caller that reports them (`crew doctor`, §11.2 check 9), and
 * `isCompleteMarker` tells a parsed marker that holds every field crew
 * records from one it can't use.
 */

import { join } from "node:path";
import { SCOPES, type Scope } from "../core/scope.ts";
import { isTapDiscovery, TAP_KINDS, type TapKind } from "../core/tap.ts";
import type { Marker } from "../core/types.ts";
import { errnoReason, isGoneError } from "../util/errno.ts";
import { readText } from "../util/fs.ts";

/** A parsed marker object, its fields unchecked: narrow each before use. */
export type UncheckedMarker = { readonly [K in keyof Marker]?: unknown };

export type MarkerRead =
  | { readonly kind: "none" }
  | { readonly kind: "unreadable" }
  | { readonly kind: "marker"; readonly marker: UncheckedMarker };

/**
 * A marker read with its reasons: `unreadable` when crew can't read the
 * file (an errno reason), `invalid` when what it read is no marker object
 * (not JSON, or JSON that isn't an object — `null` included).
 */
export type MarkerInspection =
  | { readonly kind: "none" }
  | { readonly kind: "unreadable" | "invalid"; readonly reason: string }
  | { readonly kind: "marker"; readonly marker: UncheckedMarker };

/**
 * True for a failed read of a path that can't hold a marker: gone (§10.1),
 * or a folder. A parse error isn't one: the move's strict read refuses a
 * marker it can't parse (§5.4), while `readMarkerAt` counts it as naming
 * nothing.
 */
export function isMarkerAbsenceError(err: unknown): boolean {
  return isGoneError(err) || (err as NodeJS.ErrnoException).code === "EISDIR";
}

/** JSON as a marker object; null for anything else (an array, a scalar, nothing). */
export function asMarkerObject(value: unknown): UncheckedMarker | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as UncheckedMarker;
}

/**
 * What `readMarkerAt` makes of each inspection that found no marker it can
 * pass on — every such kind, so a new one must be placed here.
 */
const NO_MARKER: { readonly [K in "unreadable" | "invalid"]: MarkerRead } = {
  invalid: { kind: "none" },
  unreadable: { kind: "unreadable" },
};

/** The marker in `installDir`, classified; never throws. One that is no marker object names nothing. */
export function readMarkerAt(installDir: string): MarkerRead {
  const read = inspectMarkerAt(installDir);
  if (read.kind === "marker" || read.kind === "none") return read;
  return NO_MARKER[read.kind];
}

/** The marker in `installDir`, classified with the reason it is no marker; never throws. */
export function inspectMarkerAt(installDir: string): MarkerInspection {
  let text: string;
  try {
    text = readText(join(installDir, ".crew.json"));
  } catch (err) {
    return isMarkerAbsenceError(err)
      ? { kind: "none" }
      : { kind: "unreadable", reason: errnoReason(err) };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { kind: "invalid", reason: "not valid JSON" };
  }
  const marker = asMarkerObject(value);
  return marker === null
    ? { kind: "invalid", reason: "not a JSON object" }
    : { kind: "marker", marker };
}

const isString = (value: unknown): boolean => typeof value === "string";
const isStringOrNull = (value: unknown): boolean => value === null || typeof value === "string";

/**
 * One test per marker field (§7.5); `tap_discovery` alone may be absent
 * (standard discovery). `crew doctor` reads every field and `--repair`
 * writes them into `config.yaml` and `state.json` (§11.2), so a marker
 * missing one is no marker it can use.
 */
const FIELD_CHECKS: { readonly [K in keyof Marker]-?: (value: unknown) => boolean } = {
  schema_version: (value) => value === 1,
  name: isString,
  agents: (value) => Array.isArray(value) && value.every(isString),
  tap_name: isString,
  tap_kind: (value) => TAP_KINDS.includes(value as TapKind),
  tap_url: isString,
  tap_subpath: isString,
  tap_path: isString,
  tap_discovery: (value) => value === undefined || isTapDiscovery(value),
  path: isString,
  ref: isStringOrNull,
  resolved_sha: isStringOrNull,
  content_hash: isString,
  scope: (value) => SCOPES.includes(value as Scope),
  installed_at: isString,
  installed_by: isString,
};

/** The first field `marker` lacks or holds with the wrong type; null when it has them all. */
export function markerFieldProblem(marker: UncheckedMarker): keyof Marker | null {
  for (const field of Object.keys(FIELD_CHECKS) as (keyof Marker)[]) {
    if (!FIELD_CHECKS[field](marker[field])) return field;
  }
  return null;
}

/** True when `marker` holds every field crew records, each of the right type. */
export function isCompleteMarker(marker: UncheckedMarker): marker is Marker {
  return markerFieldProblem(marker) === null;
}
