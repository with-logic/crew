/**
 * Error taxonomy for crew.
 *
 * Every user-visible error crew can produce has a stable name (for `--json`
 * output) and a fixed exit code, per §13 of the spec. Throwing a `CrewError`
 * at any level of the stack bubbles up to the CLI top-level handler which
 * maps it to the right exit code and formatted output.
 */

export type CrewErrorName =
  | "invalid_ref"
  | "invalid_skill"
  | "no_skills_found"
  | "source_unreachable"
  | "ref_not_found"
  | "ambiguous_reference"
  | "ambiguous_dependency"
  | "conflicting_dependencies"
  | "name_conflict"
  | "untracked_directory"
  | "customized"
  | "inconsistent_marker"
  | "not_installed_here"
  | "no_targets"
  | "config_invalid"
  | "state_locked"
  | "launchd_failure"
  | "usage_error"
  | "unknown_skill";

/** Exit codes per §15. */
export const EXIT_CODES: Record<CrewErrorName, number> = {
  invalid_ref: 4,
  invalid_skill: 4,
  no_skills_found: 4,
  source_unreachable: 5,
  ref_not_found: 5,
  ambiguous_reference: 4,
  ambiguous_dependency: 4,
  conflicting_dependencies: 4,
  name_conflict: 4,
  untracked_directory: 6,
  customized: 6,
  inconsistent_marker: 6,
  not_installed_here: 6,
  no_targets: 4,
  config_invalid: 4,
  state_locked: 7,
  launchd_failure: 8,
  usage_error: 4,
  unknown_skill: 4,
};

/**
 * Raised at any layer of the stack to signal a user-visible error.
 * The CLI entry point catches this and formats it according to the
 * current output mode (human or JSON).
 */
export class CrewError extends Error {
  override readonly name: "CrewError" = "CrewError";
  readonly code: CrewErrorName;
  readonly details: Record<string, unknown>;

  constructor(code: CrewErrorName, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }

  /** Exit code this error should terminate the process with. */
  get exitCode(): number {
    return EXIT_CODES[this.code];
  }
}

/** Convenience helper: throw a `CrewError` with the given code. */
export function fail(code: CrewErrorName, message: string, details?: Record<string, unknown>): never {
  throw new CrewError(code, message, details);
}
