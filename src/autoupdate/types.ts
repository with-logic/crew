/**
 * Shared autoupdate scheduler types (§10.2).
 *
 * Both platform backends consume the same enable input so the dispatcher
 * and concrete schedulers cannot drift independently.
 */

export interface EnableInput {
  readonly crewBinaryPath: string;
  readonly intervalSeconds: number;
  readonly home?: string;
}

/**
 * What the scheduler answered when asked whether the job is loaded.
 *
 * `"loaded"` and `"not-loaded"` are answers; `"indeterminate"` means the
 * probe itself could not run (launchctl unreachable, `systemctl` absent,
 * a spawn failure) and therefore reports nothing about the job. The
 * three are distinct because a repair that cannot verify its own
 * postcondition has not succeeded — collapsing an unanswerable probe to
 * "not loaded" would let `doctor --repair` claim it unloaded a job it
 * never confirmed was gone (§11.2).
 */
export type SchedulerState = "loaded" | "not-loaded" | "indeterminate";

/** Why a probe could not answer. Empty when the scheduler did answer. */
export interface SchedulerProbe {
  readonly state: SchedulerState;
  readonly detail: string;
}
