/** Exhaustive human labels and grouping for doctor's check findings (§11.2). */
import type { FindingCode } from "./index.ts";

export const GROUP_ORDER = ["Agents", "State", "Autoupdate", "Config", "Storage"] as const;
export type FindingGroup = (typeof GROUP_ORDER)[number];

interface FindingDescriptor {
  readonly label: string;
  readonly group: FindingGroup;
}

export const FINDING_DESCRIPTORS: Readonly<Record<FindingCode, FindingDescriptor>> = {
  state_entry_without_marker: {
    label: "crew's records show an install that isn't on disk",
    group: "State",
  },
  marker_without_state: {
    label: "there's an install on disk crew doesn't remember",
    group: "State",
  },
  customized: { label: "local edits detected (won't be overwritten)", group: "State" },
  orphan_store_entry: { label: "a cached skill is no longer referenced", group: "Storage" },
  agent_missing: { label: "an agent in your state isn't detected anymore", group: "Agents" },
  missing_project_root: { label: "a project folder is missing", group: "State" },
  autoupdate_not_loaded: {
    label: "autoupdate is enabled but the background updater isn't loaded",
    group: "Autoupdate",
  },
  autoupdate_unexpectedly_loaded: {
    label: "autoupdate is off but the background updater is still loaded",
    group: "Autoupdate",
  },
  config_invalid: { label: "~/.crew/config.yaml couldn't be parsed", group: "Config" },
  marker_unreadable: {
    label: "marker inventory could not be inspected; repair is blocked",
    group: "State",
  },
  marker_invalid: { label: "an install marker is invalid; repair is blocked", group: "State" },
};
