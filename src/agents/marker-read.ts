/**
 * Reading the crew marker in an install folder (§7.5, §11.1). A path that
 * can't hold a marker names nothing. `readMarkerAt` also reports a marker
 * crew can't parse as `none`, and one it can't read as `unreadable`: that
 * marker might name any tap, so a caller deciding whether a tap is still
 * named — auto-tap collection, say — must treat it as naming one.
 */

import { join } from "node:path";
import type { Marker } from "../core/types.ts";
import { isGoneError } from "../util/errno.ts";
import { tryReadJson } from "../util/json.ts";

/** A parsed marker object, its fields unchecked: narrow each before use. */
export type UncheckedMarker = { readonly [K in keyof Marker]?: unknown };

export type MarkerRead =
  | { readonly kind: "none" }
  | { readonly kind: "unreadable" }
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

/** The marker in `installDir`, classified; never throws. */
export function readMarkerAt(installDir: string): MarkerRead {
  let value: unknown;
  try {
    value = tryReadJson<unknown>(join(installDir, ".crew.json"));
  } catch (err) {
    const namesNothing = err instanceof SyntaxError || isNotAMarkerError(err);
    return namesNothing ? { kind: "none" } : { kind: "unreadable" };
  }
  const marker = asMarkerObject(value);
  return marker === null ? { kind: "none" } : { kind: "marker", marker };
}
