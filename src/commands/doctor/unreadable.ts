/**
 * Doctor's check 9 (§11.2; C-STATE-05a): markers and agent skills folders
 * crew can't read. Each is a finding of its own, naming the path; the
 * state entries whose markers it hides are neither reported as missing
 * their markers (check 1) nor dropped by `--repair`, since their markers
 * are unread rather than absent.
 */

import { installDirOf } from "../../agents/adapter.ts";
import { agentByName } from "../../agents/registry.ts";
import type { StateEntry } from "../../core/types.ts";
import type { Finding } from "./checks.ts";
import type { UnreadablePath } from "./markers.ts";

/** Whether `entry`'s install in `agent` sits where crew couldn't read. */
export type IsHiddenInstall = (entry: StateEntry, agent: string) => boolean;

/** One `unreadable_marker` finding per path crew couldn't read. */
export function unreadableFindings(unreadable: readonly UnreadablePath[]): Finding[] {
  const findings: Finding[] = [];
  for (const u of unreadable) {
    findings.push({
      level: "error",
      code: "unreadable_marker",
      message: `crew can't read \`${u.path}\` (${u.reason}), so it can't check the installs there`,
    });
  }
  return findings;
}

/**
 * The test for installs `unreadable` hides. An entry's folder is found
 * from the entry alone (§11.1): a project entry's from its root, and one
 * whose root locates nothing (check 8 reports it) is hidden by nothing.
 */
export function isHiddenBy(unreadable: readonly UnreadablePath[]): IsHiddenInstall {
  return (entry, agent) => {
    const adapter = agentByName(agent);
    const dir = adapter ? installDirOf(entry, adapter) : "";
    return dir !== "" && unreadable.some((u) => dir === u.hides || dir.startsWith(`${u.hides}/`));
  };
}
