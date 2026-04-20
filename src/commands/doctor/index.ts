/**
 * `crew doctor [--verify] [--repair]` (§11.2).
 *
 * Runs integrity checks (from `./checks.ts`) and optionally reconciles
 * recoverable drift via `./repair.ts`. Marker-index construction lives
 * in `./markers.ts` and is shared between the two.
 */

import { readConfig } from "../../config/load.ts";
import { crewHome } from "../../core/paths.ts";
import { readState } from "../../state/load.ts";
import type { CommandContext, CommandOutput } from "../types.ts";
import {
  checkAgentDetection,
  checkAutoupdateDrift,
  checkContentHashDrift,
  checkOrphanStoreEntries,
  checkProjectRoots,
  checkStateMarkerDrift,
  type Finding,
} from "./checks.ts";
import { buildMarkerIndex } from "./markers.ts";
import { renderDoctor } from "./render.ts";
import { repairState } from "./repair.ts";

export function doctorCommand(ctx: CommandContext): CommandOutput {
  const verify = Boolean(ctx.flags.extras["verify"]);
  const repair = Boolean(ctx.flags.extras["repair"]);
  const home = ctx.home ?? crewHome();

  const findings: Finding[] = [];
  const config = (() => {
    try {
      return readConfig(home);
    } catch (err) {
      findings.push({ level: "error", code: "config_invalid", message: (err as Error).message });
      return null;
    }
  })();

  const state = readState(home);
  const stateEntries = state.installations;
  const markers = buildMarkerIndex(stateEntries, ctx.cwd);

  findings.push(...checkStateMarkerDrift(stateEntries, markers));
  if (verify) findings.push(...checkContentHashDrift(markers));
  if (config) findings.push(...checkAgentDetection(stateEntries, config));
  findings.push(...checkOrphanStoreEntries(stateEntries, home));
  findings.push(...checkProjectRoots(stateEntries));
  if (config) findings.push(...checkAutoupdateDrift(config));

  if (repair) repairState(markers, home);

  const human = renderDoctor(findings, { repair, verify }, ctx.style);
  // After a successful `--repair`, drift-class findings are resolved, so
  // exit 0. Without `--repair`, errors keep the non-zero exit code.
  const exitCode = repair ? 0 : findings.some((f) => f.level === "error") ? 1 : 0;
  return { exitCode, human, json: { findings } };
}
