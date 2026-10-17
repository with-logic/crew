/**
 * Reading the crew marker in an install folder (§7.5, §11.1). A missing
 * marker, one crew can't parse, or a path that can't hold one names
 * nothing; one crew can't read might name any tap, so a caller deciding
 * whether a marker still names a tap — auto-tap collection, say — must
 * treat it as possibly naming one.
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

/** True for a failed read of a path that can't hold a marker: gone (§10.1), or a folder. */
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
