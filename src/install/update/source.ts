/** Inspect update sources before staging; local lookup races preserve the installed copy (§10.1). */

import { CrewError } from "../../core/errors.ts";
import type { LoadedSkill, StateEntry, TapConfig } from "../../core/types.ts";
import { loadSkill } from "../../skill/load.ts";
import { MissingSkillManifestError } from "../../skill/missing-manifest.ts";
import { isGistTap } from "../../sources/gist.ts";
import { hashSourceDirectory, isSourceDirectory } from "../../sources/read.ts";
import { isMissingSourcePathError, isSourceReadFailure } from "../../util/source-read.ts";

type SourceRead =
  | { readonly kind: "source_gone" }
  | { readonly kind: "up_to_date" }
  | {
      readonly kind: "ready";
      readonly loaded: LoadedSkill;
      readonly sourceHash: string | undefined;
    };

/** Hash before comparing the recorded hash; unchanged sources bypass full manifest validation. */
export function readUpdateSource(
  entry: StateEntry,
  tap: TapConfig,
  sourcePath: string,
  newSha: string | null,
  force: boolean,
): SourceRead {
  if (!(isGistTap(tap) || isSourceDirectory(sourcePath))) return { kind: "source_gone" };
  try {
    const sourceHash = newSha === null ? hashSourceDirectory(sourcePath) : undefined;
    if (newSha === entry.resolved_sha && !(force && entry.pinned)) {
      if (newSha !== null || sourceHash === entry.content_hash) return { kind: "up_to_date" };
    }
    return { kind: "ready", loaded: loadSkill(sourcePath, isGistTap(tap)), sourceHash };
  } catch (err) {
    // §10.1: root absence only softens an original source lookup failure, never permission/validation.
    if (tap.kind !== "path") throw err;
    if (!isLookupFailure(err)) throw err;
    if (!isSourceDirectory(sourcePath)) return { kind: "source_gone" };
    throw err;
  }
}

function isLookupFailure(err: unknown): boolean {
  if (err instanceof MissingSkillManifestError) return true;
  if (isSourceReadFailure(err)) return isMissingSourcePathError(err.cause);
  if (err instanceof CrewError) return false;
  return isMissingSourcePathError(err);
}
