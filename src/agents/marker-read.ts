/**
 * Reading the crew marker in an install folder without throwing (§7.5,
 * §11.1). A missing marker, one crew can't parse, or a path that can't
 * hold one names nothing; one crew can't read might name any tap, so a
 * caller deciding whether a marker still names a tap — auto-tap
 * collection, say — must treat it as possibly naming one.
 */

import { join } from "node:path";
import { isGoneError } from "../util/errno.ts";
import { tryReadJson } from "../util/json.ts";

/** A parsed marker object, its fields unchecked: narrow each before use. */
export type UncheckedMarker = { readonly [field: string]: unknown };

export type MarkerRead =
  | { readonly kind: "none" }
  | { readonly kind: "unreadable" }
  | { readonly kind: "marker"; readonly marker: UncheckedMarker };

/** The marker in `installDir`, classified; never throws. */
export function readMarkerAt(installDir: string): MarkerRead {
  let value: unknown;
  try {
    value = tryReadJson<unknown>(join(installDir, ".crew.json"));
  } catch (err) {
    // A `.crew.json` that is a folder can't be a marker either.
    const notAMarker =
      err instanceof SyntaxError ||
      isGoneError(err) ||
      (err as NodeJS.ErrnoException).code === "EISDIR";
    return notAMarker ? { kind: "none" } : { kind: "unreadable" };
  }
  // No file, or JSON that isn't an object: nothing a marker could name.
  if (value === null || typeof value !== "object" || Array.isArray(value)) return { kind: "none" };
  return { kind: "marker", marker: value as UncheckedMarker };
}
