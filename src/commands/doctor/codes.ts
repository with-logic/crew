/**
 * Every finding code `crew doctor` reports (§11.2), with the plain-English
 * label and the group the renderer shows it under. A code is typed by this
 * table, so a finding can't carry one the renderer doesn't know.
 */

/** Each finding code's label in human output. */
export const CODE_LABELS = {
  state_entry_without_marker: "crew's records show an install that isn't on disk",
  marker_without_state: "there's an install on disk crew doesn't remember",
  customized: "local edits detected (won't be overwritten)",
  orphan_store_entry: "a cached skill is no longer referenced",
  agent_missing: "an agent in your state isn't detected anymore",
  missing_project_root: "a project folder is missing",
  autoupdate_not_loaded: "autoupdate is enabled but the background updater isn't loaded",
  autoupdate_unexpectedly_loaded: "autoupdate is off but the background updater is still loaded",
  config_invalid: "~/.crew/config.yaml couldn't be parsed",
  unreadable_marker: "crew can't read or use an install's marker, or list a skills folder",
  marker_attribution_drift: "an install's marker names a different tap or path than crew's records",
} as const satisfies Record<string, string>;

/** A finding code (§11.2). */
export type DoctorCode = keyof typeof CODE_LABELS;

/** The themed groups findings are shown under, in display order. */
export const GROUP_ORDER = ["Agents", "State", "Autoupdate", "Config", "Storage"] as const;

/** Each finding code's group. */
export const CODE_GROUPS = {
  state_entry_without_marker: "State",
  marker_without_state: "State",
  customized: "State",
  orphan_store_entry: "Storage",
  agent_missing: "Agents",
  missing_project_root: "State",
  autoupdate_not_loaded: "Autoupdate",
  autoupdate_unexpectedly_loaded: "Autoupdate",
  config_invalid: "Config",
  unreadable_marker: "State",
  marker_attribution_drift: "State",
} as const satisfies Record<DoctorCode, (typeof GROUP_ORDER)[number]>;
