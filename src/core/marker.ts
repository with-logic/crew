/**
 * Installed-skill marker type for `.crew.json` (§7.5, §11.1), and the tap
 * descriptor every marker writer records.
 *
 * Markers are self-describing so `crew doctor --repair` can rebuild a
 * missing tap row from installed bytes alone.
 */

import type { Scope } from "./scope.ts";
import type { TapConfig, TapDiscovery, TapKind } from "./tap.ts";

/** The shape written into every `.crew.json` marker. */
export interface Marker {
  readonly schema_version: 1;
  readonly name: string;
  /** Agent names that own this install (§7.2 path sharing). */
  readonly agents: readonly string[];
  /** Tap that owned this skill at install time. May not exist in current config. */
  readonly tap_name: string;
  /** `git` (URL-backed clone) or `path` (local directory). */
  readonly tap_kind: TapKind;
  /** Clone URL for git taps; empty for path taps. */
  readonly tap_url: string;
  /** Subpath inside the git tap's repo; empty for none. */
  readonly tap_subpath: string;
  /** Absolute path to the path-kind tap's directory; empty for git taps. */
  readonly tap_path: string;
  /** Optional non-standard tap discovery mode. Absent means standard discovery. */
  readonly tap_discovery?: TapDiscovery;
  /** Skill location relative to the tap's root. Empty when the tap is one skill. */
  readonly path: string;
  readonly ref: string | null;
  readonly resolved_sha: string | null;
  readonly content_hash: string;
  readonly scope: Scope;
  readonly installed_at: string;
  readonly installed_by: string;
}

/** A marker's tap descriptor: every `tap_*` field, so a new one must be written. */
export type MarkerTapFields = Pick<Marker, Extract<keyof Marker, `tap_${string}`>>;

/** `tap` as a marker records it; `tap_discovery` only when non-standard (§7.5). */
export function markerTapFields(tap: TapConfig): MarkerTapFields {
  return {
    tap_name: tap.name,
    tap_kind: tap.kind,
    tap_url: tap.url,
    tap_subpath: tap.subpath,
    tap_path: tap.path,
    ...(tap.discovery === "recursive" ? { tap_discovery: "recursive" } : {}),
  };
}
