/**
 * Which installs a path crew couldn't check hides (§11.2 check 9;
 * C-STATE-05a): the install's own folder and any folder above it — never
 * a folder whose name only starts the same way.
 */

import { expect, test } from "bun:test";
import { dirname } from "node:path";
import { installDirOf } from "../../src/agents/adapter.ts";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { isHiddenBy } from "../../src/commands/doctor/unreadable.ts";
import type { StateEntry } from "../../src/core/types.ts";

const entry: StateEntry = {
  name: "a",
  source: { tap: "t", path: "skills/a" },
  ref: null,
  resolved_sha: null,
  content_hash: "sha256:x",
  scope: "user",
  installed_at: "2026-01-01T00:00:00Z",
  agents: ["claude-code"],
  pinned: false,
  explicit: true,
  required_by: [],
};

/** Whether `entry`'s install in `agent` is hidden by an unchecked path hiding `hides`. */
function hiddenBy(hides: string, agent = "claude-code"): boolean {
  const hidden = isHiddenBy([{ path: hides, reason: "EACCES", hides, kind: "unreadable" }]);
  return hidden(entry, agent);
}

test("C-STATE-05a an install is hidden by its own folder or any folder above it", () => {
  const dir = installDirOf(entry, claudeCodeAdapter);
  expect(hiddenBy(dir)).toBe(true);
  expect(hiddenBy(dirname(dir))).toBe(true);
  expect(hiddenBy(dirname(dirname(dir)))).toBe(true);
});

test("C-STATE-05a a folder whose name only starts the same way hides nothing", () => {
  const dir = installDirOf(entry, claudeCodeAdapter);
  expect(hiddenBy(`${dir}b`)).toBe(false);
  expect(hiddenBy(dirname(dir).slice(0, -1))).toBe(false);
  expect(hiddenBy(dir, "no-such-agent")).toBe(false);
});
