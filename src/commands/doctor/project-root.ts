/**
 * Looking at a project root doctor walks (§11.2 checks 8 and 9). A root
 * that is gone — or no folder, since nothing can be read beneath it — is
 * missing (check 8). One crew can't look at, a folder above it being one
 * it can't search, isn't missing: its installs are unread (check 9).
 */

import { statSync } from "node:fs";
import type { StateEntry } from "../../core/types.ts";
import { hasUsableProjectRoot } from "../../state/validation.ts";
import { errnoReason, isGoneError } from "../../util/errno.ts";

/** What doctor finds at a project root. */
export type RootLook =
  | { readonly kind: "usable" | "missing" }
  | { readonly kind: "hidden"; readonly reason: string };

/** What is at `root`. */
export function lookAtRoot(root: string): RootLook {
  try {
    return statSync(root).isDirectory() ? { kind: "usable" } : { kind: "missing" };
  } catch (err) {
    return isGoneError(err) ? { kind: "missing" } : { kind: "hidden", reason: errnoReason(err) };
  }
}

/** What is at `entry`'s recorded project root; one that locates nothing (§11.1) is missing. */
export function lookAtEntryRoot(entry: StateEntry): RootLook {
  return hasUsableProjectRoot(entry) ? lookAtRoot(entry.project_root) : { kind: "missing" };
}
