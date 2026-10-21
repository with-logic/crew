/** Decode marker tap metadata once for validation and reconstruction (§7.5, §11.2). */
import { parseTapEntry } from "../../../config/taps.ts";
import type { Marker, TapConfig } from "../../../core/types.ts";

export type MarkerTapMetadata = Pick<
  Marker,
  "tap_name" | "tap_url" | "tap_subpath" | "tap_path" | "tap_discovery"
> & { readonly tap_kind: string };

/** Apply config's existing tap rules and reconstruct an auto tap, never a registered tap. */
export function markerTapConfig(marker: MarkerTapMetadata): TapConfig {
  return parseTapEntry({
    name: marker.tap_name,
    kind: marker.tap_kind,
    registered: false,
    url: marker.tap_url,
    subpath: marker.tap_subpath,
    path: marker.tap_path,
    ...(marker.tap_discovery === undefined ? {} : { discovery: marker.tap_discovery }),
  });
}
