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
import type { AutoupdateRepair } from "./autoupdate.ts";
import {
  checkAgentDetection,
  checkAutoupdateDrift,
  checkContentHashDrift,
  checkOrphanStoreEntries,
  checkProjectRoots,
  checkStateMarkerDrift,
  type Finding,
} from "./checks.ts";
import { applyRepairs } from "./coordinator.ts";
import { buildMarkerIndex } from "./markers.ts";
import { renderDoctor } from "./render.ts";
import { isRepairableCode } from "./repairable.ts";

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
  findings.push(...checkOrphanStoreEntries(state, home));
  findings.push(...checkProjectRoots(stateEntries));
  if (config) findings.push(...checkAutoupdateDrift(config));

  // `--repair --dry-run` reports what a repair would address and
  // applies nothing. Repair also rebuilds `config.yaml` taps from
  // markers, so an unparseable config makes it unsafe: report the
  // `config_invalid` finding instead of failing with a bare error.
  const dryRun = repair && ctx.flags.dryRun;
  // An unparseable config still skips the repair entirely: the rebuild
  // rewrites `config.yaml` taps from markers, so running it against a
  // file we could not read would discard whatever the user has there.
  const applied = repair && !dryRun && config !== null;
  const repairs: AutoupdateRepair[] = applied ? applyRepairs(markers, home) : [];

  const human = renderDoctor(findings, { repair, verify, dryRun, applied }, ctx.style, repairs);
  // A `--repair` run resolves the repairable drift classes, so those
  // findings stop counting against the exit code. Anything repair
  // can't fix (§11.2) still does — otherwise a repair would report
  // success while a real problem remains — as does a repair that was
  // attempted and failed. Without `--repair` (or on a dry run, or when
  // an unparseable config skipped the repair), every error counts.
  const blocking = findings.filter(
    (f) => f.level === "error" && !(applied && isRepairableCode(f.code)),
  );
  const failedRepairs = repairs.filter((r) => r.level === "error");
  const exitCode = blocking.length > 0 || failedRepairs.length > 0 ? 1 : 0;
  return {
    exitCode,
    human,
    // §11.2: `repairs` describes what a repair did, so it appears only
    // on a `--repair` response.
    json: applied ? { findings, repairs, dry_run: dryRun } : { findings, dry_run: dryRun },
  };
}
