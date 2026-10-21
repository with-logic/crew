/** Read and validate an original doctor marker fixture before targeted corruption (§7.5, §11.2). */
import { ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isDoctorMarker } from "../../src/commands/doctor/markers/validate.ts";
import type { Marker } from "../../src/core/types.ts";

/** Assert that a fixture starts with a valid marker, retaining its narrowed type. */
export function readDoctorMarker(path: string): Marker {
  const marker: unknown = JSON.parse(readFileSync(path, "utf8"));
  ok(isDoctorMarker(marker));
  return marker;
}
