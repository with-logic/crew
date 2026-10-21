/** Validate marker bytes before doctor trusts them to rebuild state/config (§7.5, §11.2). */
import { parseTapEntry } from "../../../config/taps.ts";
import type { Marker } from "../../../core/types.ts";
import { validateFrontmatterName } from "../../../skill/validate.ts";

export function isDoctorMarker(value: unknown): value is Marker {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const marker = value as Record<string, unknown>;
  if (marker["schema_version"] !== 1) return false;
  if (marker["scope"] !== "user" && marker["scope"] !== "project") return false;
  if (!Array.isArray(marker["agents"]) || marker["agents"].length === 0) return false;
  for (const agent of marker["agents"]) {
    if (typeof agent !== "string" || agent.length === 0) return false;
  }
  for (const key of [
    "name",
    "tap_name",
    "tap_kind",
    "tap_url",
    "tap_subpath",
    "tap_path",
    "path",
    "content_hash",
    "installed_at",
    "installed_by",
  ]) {
    if (typeof marker[key] !== "string") return false;
  }
  if (marker["tap_discovery"] !== undefined && marker["tap_discovery"] !== "recursive")
    return false;
  for (const key of ["ref", "resolved_sha"]) {
    if (marker[key] !== null && typeof marker[key] !== "string") return false;
  }
  try {
    validateFrontmatterName({ name: marker["name"] as string });
    parseTapEntry({
      name: marker["tap_name"] as string,
      kind: marker["tap_kind"] as string,
      url: marker["tap_url"] as string,
      subpath: marker["tap_subpath"] as string,
      path: marker["tap_path"] as string,
      ...(marker["tap_discovery"] === undefined
        ? {}
        : { discovery: marker["tap_discovery"] as string }),
    });
    return true;
  } catch {
    return false;
  }
}
