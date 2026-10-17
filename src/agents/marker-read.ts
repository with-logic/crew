/**
 * Reading the crew marker in an install folder (§7.5, §11.1). A path that
 * can't hold a marker names nothing. `readMarkerAt` also reports a marker
 * crew can't parse as `none`, and one it can't read as `unreadable`: that
 * marker might name any tap, so a caller deciding whether a tap is still
 * named — auto-tap collection, say — must treat it as naming one.
 * `inspectMarkerAt` is the same reading with the reasons kept, for a
 * caller that reports them (`crew doctor`, §11.2 check 9).
 */

import { join } from "node:path";
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
export function isNotAMarkerError(err: unknown): boolean {
  return isGoneError(err) || (err as NodeJS.ErrnoException).code === "EISDIR";
}

/** JSON as a marker object; null for anything else (an array, a scalar, nothing). */
export function asMarkerObject(value: unknown): UncheckedMarker | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as UncheckedMarker;
}

/** The marker in `installDir`, classified; never throws. One that is no marker object names nothing. */
export function readMarkerAt(installDir: string): MarkerRead {
  const read = inspectMarkerAt(installDir);
  if (read.kind === "marker" || read.kind === "none") return read;
  return read.kind === "invalid" ? { kind: "none" } : { kind: "unreadable" };
}

/** The marker in `installDir`, classified with the reason it is no marker; never throws. */
export function inspectMarkerAt(installDir: string): MarkerInspection {
  let text: string;
  try {
    text = readText(join(installDir, ".crew.json"));
  } catch (err) {
    return isNotAMarkerError(err)
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
