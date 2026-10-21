/** Authoritative installed markers reserve their source identity (§5.4, §11.1). */

import { join } from "node:path";
import { CrewError } from "../../core/errors.ts";
import type { Marker, TapConfig } from "../../core/types.ts";
import { tryReadJson } from "../../util/json.ts";
import { sameSourceIdentity, sourceIdentityOf } from "../source-identity.ts";

export function assertSameMarkerSource(
  dest: string,
  name: string,
  tap: TapConfig,
  path: string,
): void {
  const marker = tryReadJson<Marker>(join(dest, ".crew.json"));
  if (!marker || marker.name !== name) return;
  const previous = sourceIdentityOf(
    {
      name: marker.tap_name,
      kind: marker.tap_kind,
      url: marker.tap_url,
      subpath: marker.tap_subpath,
      path: marker.tap_path,
      registered: false,
    },
    marker.path,
  );
  if (!sameSourceIdentity(previous, sourceIdentityOf(tap, path)))
    throw new CrewError("name_conflict", `A different source already owns \`${dest}\``, { dest });
}
