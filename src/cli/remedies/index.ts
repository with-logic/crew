/**
 * Default remedy hint per error code (§13), one entry per file.
 *
 * Keep them concrete, action-oriented, and spoken in a peer-to-peer
 * voice — "try X" over "you must X". These ride along with the error
 * message to point users at the next step; `../output.ts` renders them.
 */

import type { CrewErrorName } from "../../core/errors.ts";
import { ambiguousDependency } from "./ambiguous-dependency.ts";
import { ambiguousReference } from "./ambiguous-reference.ts";
import { autoupdateFailure } from "./autoupdate-failure.ts";
import { configInvalid } from "./config-invalid.ts";
import { conflictingDependencies } from "./conflicting-dependencies.ts";
import { customized } from "./customized.ts";
import { inconsistentMarker } from "./inconsistent-marker.ts";
import { invalidRef } from "./invalid-ref.ts";
import { invalidSkill } from "./invalid-skill.ts";
import { manifestInvalid } from "./manifest-invalid.ts";
import { nameConflict } from "./name-conflict.ts";
import { noAgents } from "./no-agents.ts";
import { noSkillsFound } from "./no-skills-found.ts";
import { notInstalledHere } from "./not-installed-here.ts";
import { refNotFound } from "./ref-not-found.ts";
import { selfUpdateFailed } from "./self-update-failed.ts";
import { selfUpdateUnavailable } from "./self-update-unavailable.ts";
import { sourceGone } from "./source-gone.ts";
import { sourceUnreachable } from "./source-unreachable.ts";
import { stateLocked } from "./state-locked.ts";
import { tapMissing } from "./tap-missing.ts";
import { unknownSkill } from "./unknown-skill.ts";
import { untrackedDirectory } from "./untracked-directory.ts";
import { usageError } from "./usage-error.ts";

export const REMEDIES: Partial<Record<CrewErrorName, string>> = {
  invalid_ref: invalidRef,
  invalid_skill: invalidSkill,
  no_skills_found: noSkillsFound,
  source_unreachable: sourceUnreachable,
  source_gone: sourceGone,
  tap_missing: tapMissing,
  ref_not_found: refNotFound,
  ambiguous_reference: ambiguousReference,
  ambiguous_dependency: ambiguousDependency,
  conflicting_dependencies: conflictingDependencies,
  name_conflict: nameConflict,
  untracked_directory: untrackedDirectory,
  customized: customized,
  inconsistent_marker: inconsistentMarker,
  not_installed_here: notInstalledHere,
  no_agents: noAgents,
  config_invalid: configInvalid,
  manifest_invalid: manifestInvalid,
  state_locked: stateLocked,
  autoupdate_failure: autoupdateFailure,
  self_update_unavailable: selfUpdateUnavailable,
  self_update_failed: selfUpdateFailed,
  usage_error: usageError,
  unknown_skill: unknownSkill,
};
