/** Doctor's exhaustive check-finding contract, separate from repair outcomes (§11.2). */
export type FindingCode =
  | "state_entry_without_marker"
  | "marker_without_state"
  | "customized"
  | "agent_missing"
  | "orphan_store_entry"
  | "missing_project_root"
  | "autoupdate_not_loaded"
  | "autoupdate_unexpectedly_loaded"
  | "config_invalid"
  | "marker_invalid"
  | "marker_unreadable";

export interface Finding {
  readonly level: "ok" | "warn" | "error";
  readonly code: FindingCode;
  readonly message: string;
}
