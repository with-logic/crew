/**
 * The check before an install that moves entries (§5.4, §11.1): a move
 * whose markers can't follow is refused before anything — config, a
 * marker, state — is written.
 */

import { accessSync, constants } from "node:fs";
import type { AgentAdapter } from "../../agents/adapter.ts";
import type { DuplicateAnalysis } from "../duplicate-rules/index.ts";
import { markersToMove, targetedFolders } from "./markers.ts";

/**
 * Throw when a marker a move will rewrite can't be parsed, or sits in a
 * folder crew can't write (`writeJson` renames a new marker into place):
 * every marker an up-front move claims, and those a reinstall's move
 * claims outside the folders the reinstall targets — its own to write, and
 * to report agent by agent.
 */
export function preflightMoves(
  analysis: Pick<DuplicateAnalysis, "reattributions" | "movesOnSuccess">,
  agents: readonly AgentAdapter[],
  cwd: string,
): void {
  const targeted = targetedFolders(analysis.movesOnSuccess, agents, cwd);
  const markers = [
    ...markersToMove(analysis.reattributions, cwd),
    ...markersToMove(analysis.movesOnSuccess, cwd, targeted),
  ];
  for (const m of markers) accessSync(m.installDir, constants.W_OK);
}
