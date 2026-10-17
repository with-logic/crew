/**
 * Whether a marker `crew doctor` read is one it can use (§11.2 check 9):
 * it holds every field crew records (§7.5), it is the marker of the folder
 * crew found it in — its `name` that folder's, its `scope` the one crew
 * walked — and its tap loads as a `config.yaml` row (§6.1), since
 * `--repair` may write it there. Anything else is the user's to reinstall,
 * and repair writes nothing from it.
 */

import { basename } from "node:path";
import {
  isCompleteMarker,
  markerFieldProblem,
  type UncheckedMarker,
} from "../../agents/marker-read.ts";
import { parseTapEntry, recordedDiscovery, serializeTap } from "../../config/taps.ts";
import type { CrewError } from "../../core/errors.ts";
import type { Marker, Scope, TapConfig } from "../../core/types.ts";

/** `marker` when doctor can use it, found in `installDir` at `scope`; otherwise why not. */
export function usableMarker(
  marker: UncheckedMarker,
  installDir: string,
  scope: Scope,
): Marker | string {
  if (!isCompleteMarker(marker)) {
    return `not a crew marker: missing or invalid \`${markerFieldProblem(marker)}\``;
  }
  if (marker.name !== basename(installDir)) {
    return `not this folder's marker: it names the skill \`${marker.name}\``;
  }
  if (marker.scope !== scope) return `not this folder's marker: it records ${marker.scope} scope`;
  const tapProblem = rebuiltTapProblem(marker);
  return tapProblem === null ? marker : `its tap wouldn't load: ${tapProblem}`;
}

/** The auto tap `--repair` rebuilds from `marker` when config has none by its name. */
export function rebuiltTap(marker: Marker): TapConfig {
  return {
    name: marker.tap_name,
    kind: marker.tap_kind,
    registered: false, // reconstructed taps default to auto
    url: marker.tap_url,
    subpath: marker.tap_subpath,
    path: marker.tap_path,
    ...recordedDiscovery({ kind: marker.tap_kind, url: marker.tap_url }, marker.tap_discovery),
  };
}

/**
 * Why `marker`'s tap wouldn't load as a `config.yaml` row — an empty or
 * unsafe name, a git tap with no URL, a path tap with no path — judged by
 * the loader itself; null when it would.
 */
function rebuiltTapProblem(marker: Marker): string | null {
  try {
    parseTapEntry(serializeTap(rebuiltTap(marker)));
    return null;
  } catch (err) {
    // `parseTapEntry` throws only `config_invalid` CrewErrors.
    return (err as CrewError).message.replace(/^config\.yaml: /, "");
  }
}
