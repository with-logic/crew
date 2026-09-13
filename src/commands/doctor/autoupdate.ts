/**
 * Autoupdate drift repair for `crew doctor --repair` (§11.2, check 7).
 *
 * Reconciles the platform scheduler to the config's `autoupdate.enabled`
 * value: enabled-but-not-loaded → write and load the scheduler at the
 * configured interval (what `crew autoupdate enable` does);
 * disabled-but-loaded → unload and remove it (what `crew autoupdate
 * disable` does). A platform failure becomes an error-level repair
 * result rather than an exception so the rest of the repair still runs.
 *
 * Every attempt is confirmed against the scheduler's ACTUAL state
 * afterwards, in both directions, rather than trusting the backend to
 * have thrown. A load can exit 0 without the job appearing, and an
 * unload can report success while the job is still registered; either
 * would otherwise let doctor claim it fixed drift that is still there.
 *
 * The confirming probe is tri-state. A probe that could not run —
 * launchctl unreachable, no systemd user bus — reports nothing about
 * the job, so it is treated as a failed repair rather than as a
 * confirmed "not loaded". Reading an unanswerable probe as an answer is
 * how a disable reports success without ever verifying its own
 * postcondition.
 */

import {
  disableAutoupdate,
  enableAutoupdate,
  probeAutoupdate,
} from "../../autoupdate/scheduler.ts";
import type { Config } from "../../core/types.ts";
import type { Finding } from "./checks.ts";

/** Machine-readable outcome of one scheduler reconciliation. */
export type AutoupdateRepairCode =
  | "autoupdate_loaded"
  | "autoupdate_unloaded"
  | "autoupdate_repair_failed";

/**
 * The stable per-repair contract (§11.2). Narrower than `Finding` on
 * purpose: only these three codes can occur, and a repair either worked
 * or didn't — there is no "warn" outcome to be ambiguous about.
 *
 * A discriminated union rather than two independent fields, so a
 * success carrying `autoupdate_repair_failed` (or a failure claiming
 * `autoupdate_loaded`) cannot be constructed at all. The pairing is the
 * external contract; letting the type permit a mismatch would make the
 * JSON output lie in a way no test necessarily catches.
 */
export type AutoupdateRepair =
  | {
      readonly level: "ok";
      readonly code: Exclude<AutoupdateRepairCode, "autoupdate_repair_failed">;
      readonly message: string;
    }
  | {
      readonly level: "error";
      readonly code: "autoupdate_repair_failed";
      readonly message: string;
    };

/** One entry per drift finding: what was reconciled, or why it couldn't be. */
export function repairAutoupdateDrift(
  findings: readonly Finding[],
  config: Config,
  home: string,
): AutoupdateRepair[] {
  const repairs: AutoupdateRepair[] = [];
  for (const f of findings) {
    if (f.code === "autoupdate_not_loaded") {
      repairs.push(
        attempt("autoupdate_loaded", "loaded the background updater", true, () =>
          enableAutoupdate({
            crewBinaryPath: process.execPath,
            intervalSeconds: config.autoupdate.interval_seconds,
            home,
          }),
        ),
      );
    }
    if (f.code === "autoupdate_unexpectedly_loaded") {
      repairs.push(
        attempt("autoupdate_unloaded", "unloaded the background updater", false, () =>
          disableAutoupdate(home),
        ),
      );
    }
  }
  return repairs;
}

/**
 * Run one reconciliation and verify it took effect. `wantLoaded` is the
 * scheduler state the repair is aiming for; if the scheduler disagrees
 * afterwards, the repair failed regardless of whether the backend threw.
 *
 * The check runs for BOTH directions. Trusting a backend to throw is
 * not enough in either: `launchctl bootstrap` can exit 0 without the
 * job appearing, and an unload can report success while the job is
 * still registered. Only the scheduler's own answer settles it.
 */
function attempt(
  code: Exclude<AutoupdateRepairCode, "autoupdate_repair_failed">,
  message: string,
  wantLoaded: boolean,
  run: () => void,
): AutoupdateRepair {
  try {
    run();
  } catch (err) {
    // The scheduler backends throw `CrewError("autoupdate_failure")`,
    // but a non-Error throw would otherwise become `undefined` here.
    return failure(err instanceof Error ? err.message : String(err));
  }
  const probe = probeAutoupdate();
  // A probe that could not run tells us nothing about the job, so the
  // postcondition is unverified and the repair has not succeeded. Only
  // an actual answer from the scheduler can confirm it.
  if (probe.state === "indeterminate") {
    return failure(`couldn't confirm the scheduler's state afterwards — ${probe.detail}`);
  }
  if ((probe.state === "loaded") !== wantLoaded) {
    return failure(
      wantLoaded
        ? "the platform scheduler still reports it as not loaded"
        : "the platform scheduler still reports it as loaded",
    );
  }
  return { level: "ok", code, message };
}

function failure(detail: string): AutoupdateRepair {
  return {
    level: "error",
    code: "autoupdate_repair_failed",
    message: `couldn't reconcile the background updater — ${detail}`,
  };
}
