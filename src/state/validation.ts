/**
 * Validate untrusted state records without discarding unusable project roots (§11.1).
 * Root validity is checked separately before filesystem access; doctor needs the
 * original record to report and retain installs whose locations are unknown.
 */

import { isAbsolute } from "node:path";
import type { StateEntry } from "../core/types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStrings(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  for (const item of value) {
    if (typeof item !== "string") return false;
  }
  return true;
}

/** Non-record data is corrupt state; valid records keep their original roots. */
export function isStateEntry(value: unknown): value is StateEntry {
  if (!(isRecord(value) && isRecord(value["source"]))) return false;
  const source = value["source"];
  return (
    typeof value["name"] === "string" &&
    typeof source["tap"] === "string" &&
    typeof source["path"] === "string" &&
    (value["ref"] === null || typeof value["ref"] === "string") &&
    (value["resolved_sha"] === null || typeof value["resolved_sha"] === "string") &&
    typeof value["content_hash"] === "string" &&
    (value["scope"] === "user" || value["scope"] === "project") &&
    typeof value["installed_at"] === "string" &&
    isStrings(value["agents"]) &&
    typeof value["pinned"] === "boolean" &&
    typeof value["explicit"] === "boolean" &&
    isStrings(value["required_by"])
  );
}

/** §11.1: no missing or relative project root can authorize filesystem access. */
export function hasUsableProjectRoot(
  entry: Pick<StateEntry, "project_root">,
): entry is Pick<StateEntry, "project_root"> & { readonly project_root: string } {
  return typeof entry.project_root === "string" && isAbsolute(entry.project_root);
}
