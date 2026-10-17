/**
 * Reading the crew marker in an install folder without throwing (§7.5,
 * §11.1). A missing marker, or one crew can't parse, names nothing; one
 * crew can't read might name anything, so a caller deciding what no
 * marker needs any more — an auto tap to collect, say — must not take it
 * for nothing.
 */

import { join } from "node:path";
import type { Marker } from "../core/types.ts";
import { isGoneError } from "../util/errno.ts";
import { tryReadJson } from "../util/json.ts";

export type MarkerRead =
  | { readonly kind: "none" }
  | { readonly kind: "unreadable" }
  | { readonly kind: "marker"; readonly marker: Marker };

/** The marker in `installDir`, classified; never throws. */
export function readMarkerAt(installDir: string): MarkerRead {
  let value: unknown;
  try {
    value = tryReadJson<unknown>(join(installDir, ".crew.json"));
  } catch (err) {
    return err instanceof SyntaxError || isGoneError(err)
      ? { kind: "none" }
      : { kind: "unreadable" };
  }
  if (value === null || typeof value !== "object") return { kind: "none" };
  return { kind: "marker", marker: value as Marker };
}
