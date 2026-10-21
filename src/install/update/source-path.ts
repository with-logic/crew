/** Preserve updates of former root-directory gist installations (§9, §10.1). */

import type { Config, StateEntry } from "../../core/types.ts";
import { isGistTap } from "../../sources/gist.ts";

export function entryWithGistFilename(entry: StateEntry, config: Config): StateEntry {
  if (entry.source.path !== "") return entry;
  const tap = config.taps.find((candidate) => candidate.name === entry.source.tap);
  return tap && isGistTap(tap)
    ? { ...entry, source: { ...entry.source, path: "SKILL.md" } }
    : entry;
}
