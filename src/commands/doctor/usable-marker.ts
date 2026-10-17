/**
 * Whether a marker `crew doctor` read is one it can use (§11.2 check 9):
 * it holds every field crew records (§7.5), it is the marker of the folder
 * crew found it in — its `name` that folder's, its `scope` the one crew
 * walked — and its tap loads as a `config.yaml` row (§6.1), since
 * `--repair` may write it there. Anything else is the user's to reinstall,
 * and repair writes nothing from it. A complete marker is judged only by
 * the walks of the agents it lists — agents share skills folders (§7.2),
 * so another's walk may pass through — and one of the other scope in a
 * folder that scope's walk reads too (`./scope-folders.ts`) is that
 * walk's.
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

/** What doctor makes of a marker it read: one it uses, another walk's to judge, or why not. */
export type MarkerUse =
  | { readonly kind: "usable"; readonly marker: Marker }
  | { readonly kind: "elsewhere" }
  | { readonly kind: "unusable"; readonly reason: string };

/**
 * What doctor makes of `marker`, found in `installDir` on `adapter`'s walk
 * at `scope`, in a folder the walks of `scopesHere` read.
 */
export function usableMarker(
  marker: UncheckedMarker,
  installDir: string,
  walk: {
    readonly adapter: string;
    readonly scope: Scope;
    readonly scopesHere: ReadonlySet<Scope>;
  },
): MarkerUse {
  if (!isCompleteMarker(marker)) {
    return unusable(`not a crew marker: missing or invalid \`${markerFieldProblem(marker)}\``);
  }
  const { adapter, scope, scopesHere } = walk;
  if (!marker.agents.includes(adapter)) return { kind: "elsewhere" };
  if (marker.name !== basename(installDir)) {
    return unusable(`not this folder's marker: it names the skill \`${marker.name}\``);
  }
  if (marker.scope !== scope) {
    if (scopesHere.has(marker.scope)) return { kind: "elsewhere" };
    return unusable(`not this folder's marker: it records ${marker.scope} scope`);
  }
  const tapProblem = rebuiltTapProblem(marker);
  if (tapProblem !== null) return unusable(`its tap wouldn't load: ${tapProblem}`);
  return { kind: "usable", marker };
}

function unusable(reason: string): MarkerUse {
  return { kind: "unusable", reason };
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
