/** Validate parsed marker values before doctor trusts them to rebuild state/config (§7.5, §11.2). */
import { agentByName } from "../../../agents/registry.ts";
import type { Marker } from "../../../core/types.ts";
import { validateFrontmatterName } from "../../../skill/validate.ts";
import { assertRecordedSourcePath } from "../../../sources/path.ts";
import { type MarkerTapMetadata, markerTapConfig } from "./tap.ts";

const MARKER_SCHEMA_VERSION: Marker["schema_version"] = 1;
const STRING_FIELDS = {
  name: true,
  tap_name: true,
  tap_kind: true,
  tap_url: true,
  tap_subpath: true,
  tap_path: true,
  path: true,
  content_hash: true,
  installed_at: true,
  installed_by: true,
} satisfies Record<
  Exclude<
    keyof Marker,
    "schema_version" | "scope" | "agents" | "tap_discovery" | "ref" | "resolved_sha"
  >,
  true
>;

/** Accept §7.5 types and semantic metadata before trusting any owner's marker (§11.2). */
export function isDoctorMarker(value: unknown): value is Marker {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const marker = value as Record<string, unknown>;
  if (marker["schema_version"] !== MARKER_SCHEMA_VERSION) return false;
  if (marker["scope"] !== "user" && marker["scope"] !== "project") return false;
  if (!Array.isArray(marker["agents"]) || marker["agents"].length === 0) return false;
  for (const agent of marker["agents"]) {
    if (typeof agent !== "string" || agent.length === 0 || !agentByName(agent)) return false;
  }
  for (const key of Object.keys(STRING_FIELDS)) {
    if (typeof marker[key] !== "string") return false;
  }
  if (marker["tap_discovery"] !== undefined && marker["tap_discovery"] !== "recursive")
    return false;
  for (const key of ["ref", "resolved_sha"]) {
    if (marker[key] !== null && typeof marker[key] !== "string") return false;
  }
  const contentHash = marker["content_hash"] as string;
  if (contentHash.length !== 71 || !/^sha256:[0-9a-f]{64}$/.test(contentHash)) return false;
  const sha = marker["resolved_sha"];
  if (marker["tap_kind"] === "path" && sha !== null) return false;
  if (
    marker["tap_kind"] === "git" &&
    (typeof sha !== "string" || sha.length !== 40 || !/^[0-9a-fA-F]{40}$/.test(sha))
  )
    return false;
  try {
    assertRecordedSourcePath(marker["path"] as string);
    validateFrontmatterName({ name: marker["name"] as string });
    markerTapConfig(marker as MarkerTapMetadata);
    return true;
  } catch {
    return false;
  }
}
