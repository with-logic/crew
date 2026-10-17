/**
 * Doctor's check 9 (§11.2; C-STATE-05a): markers and agent skills folders
 * crew can't read. Each is a finding of its own, naming the path; the
 * state entries whose markers it hides are neither reported as missing
 * their markers (check 1) nor dropped by `--repair`, since their markers
 * are unread rather than absent.
 */

import { join } from "node:path";
import { baseFor, cwdForEntry } from "../../agents/adapter.ts";
import { agentByName } from "../../agents/registry.ts";
import type { StateEntry } from "../../core/types.ts";
import { hasUsableProjectRoot } from "../../state/validation.ts";
import type { Finding } from "./checks.ts";
import type { UnreadablePath } from "./markers.ts";

/** Whether `entry`'s install in `agent` sits where crew couldn't read. */
export type HiddenInstall = (entry: StateEntry, agent: string) => boolean;

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

/** The test for installs `unreadable` hides, resolving user-scope folders against `cwd`. */
export function hiddenInstalls(unreadable: readonly UnreadablePath[], cwd: string): HiddenInstall {
  return (entry, agent) => {
    const adapter = agentByName(agent);
    // An unusable project root locates nothing (§11.1; check 8 reports it).
    if (!adapter || (entry.scope === "project" && !hasUsableProjectRoot(entry))) return false;
    const base = baseFor(adapter, entry.scope, cwdForEntry(entry, cwd));
    const dir = join(base, entry.name);
    return base !== "" && unreadable.some((u) => dir === u.hides || dir.startsWith(`${u.hides}/`));
  };
}
