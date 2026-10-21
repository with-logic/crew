/** Gist sibling lookup reuses named candidates only for captured immutable trees (§9 step 6). */

import type { Config, TapConfig } from "../../core/types.ts";
import { gistCandidates } from "../../sources/gist.ts";
import { duplicateSiblingError } from "./errors.ts";
import type { SiblingHit } from "./index.ts";

export function gistSibling(
  root: string,
  tap: TapConfig,
  config: Config,
  depName: string,
  captured: boolean,
): SiblingHit | null {
  const candidates = gistCandidates(root, captured ? depName : undefined);
  const matches = captured
    ? candidates
    : candidates.filter((candidate) => candidate.frontmatter.name === depName);
  if (matches.length > 1)
    throw duplicateSiblingError(
      depName,
      tap.name,
      matches.map((candidate) => ({ dirName: candidate.filename })),
    );
  const match = matches[0];
  return match ? { tap, config, tapRelativePath: match.filename, loaded: match } : null;
}
