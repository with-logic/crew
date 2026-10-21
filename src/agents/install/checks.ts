/** Destination safety checks shared with new-child transactions (§7.3, §10.1.1). */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../../core/errors.ts";
import type { Marker } from "../../core/types.ts";
import { hashDirectory } from "../../hash/content.ts";
import { tryReadJson } from "../../util/json.ts";
import type { InstallInput } from "./types.ts";

export function checkInstall(input: InstallInput, dest: string) {
  const incomingAdapters = [...new Set(input.agents.map((a) => a.name))].sort();
  let priorAdapters: readonly string[] = [];
  if (existsSync(dest)) {
    const existingMarker = tryReadJson<Marker>(join(dest, ".crew.json"));
    if (existingMarker) {
      priorAdapters = existingMarker.agents ?? [];
      if (existingMarker.name === input.skillName) {
        const currentHash = hashDirectory(dest);
        if (currentHash !== existingMarker.content_hash && !input.force)
          throw new CrewError(
            "customized",
            `\`${input.skillName}\` has local edits at \`${dest}\` — leaving them alone`,
            { dest, expected: existingMarker.content_hash, actual: currentHash },
          );
        const mergedAdapters = [...new Set([...priorAdapters, ...incomingAdapters])].sort();
        const sameAdapters =
          mergedAdapters.length === priorAdapters.length &&
          mergedAdapters.every((a, i) => a === priorAdapters[i]);
        if (
          existingMarker.resolved_sha === input.resolvedSha &&
          existingMarker.content_hash === input.contentHash &&
          sameAdapters &&
          !input.force
        )
          return { upToDate: true, agents: mergedAdapters, incomingAdapters };
      } else if (!input.force) {
        throw new CrewError(
          "inconsistent_marker",
          `\`${dest}\` has a crew marker for \`${existingMarker.name}\` but we're installing \`${input.skillName}\` — investigate before forcing`,
          { dest, existingName: existingMarker.name, incomingName: input.skillName },
        );
      }
    } else if (!input.force) {
      throw new CrewError(
        "untracked_directory",
        `\`${dest}\` exists but wasn't installed by crew (no .crew.json marker)`,
        { dest },
      );
    }
  }
  return {
    upToDate: false,
    agents: [...new Set([...priorAdapters, ...incomingAdapters])].sort(),
    incomingAdapters,
  };
}
