/**
 * `crew doctor [--verify] [--repair]` (§11.2).
 *
 * Runs integrity checks (from `./checks.ts`) and optionally reconciles
 * recoverable drift via `./repair.ts`. `--repair --dry-run` runs the
 * checks and lists what a repair would address without applying it.
 * Marker-index construction lives in `./markers.ts` and is shared.
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
import { isRepairableCode, renderDoctor } from "./render.ts";
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

  // `--repair --dry-run` reports what a repair would address and
  // applies nothing. Repair also rebuilds `config.yaml` taps from
  // markers, so an unparseable config makes it unsafe: report the
  // `config_invalid` finding instead of failing with a bare error.
  const dryRun = repair && ctx.flags.dryRun;
  const applied = repair && !dryRun && config !== null;
  if (applied) repairState(markers, home);

  const human = renderDoctor(findings, { repair, verify, dryRun, applied }, ctx.style);
  // A `--repair` run resolves the repairable drift classes, so those
  // findings stop counting against the exit code. Anything repair
  // can't fix (§11.2) still does — otherwise a repair would report
  // success while a real problem remains. Without `--repair` (or on a
  // dry run, or when an unparseable config skipped the repair), every
  // error counts.
  const blocking = findings.filter(
    (f) => f.level === "error" && !(applied && isRepairableCode(f.code)),
  );
  const exitCode = blocking.length > 0 ? 1 : 0;
  return { exitCode, human, json: { findings, dry_run: dryRun } };
}
