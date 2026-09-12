/**
 * Shared helpers for the `--dry-run` housekeeping suites (§5.2).
 *
 * Each command has its own file in this directory; everything they
 * share about reading on-disk state back, and the doctor suites'
 * common scheduler/adapter pinning, lives here.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { resetLaunchctlRunner, setLaunchctlRunner } from "../../../src/autoupdate/launchd.ts";
import {
  resetAutoupdatePlatform,
  setAutoupdatePlatform,
} from "../../../src/autoupdate/scheduler.ts";
import { paths } from "../../../src/core/paths.ts";
import type { StateEntry } from "../../../src/core/types.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";

/** File contents, or null when the file doesn't exist. */
export function readOrNull(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

/** State, config, and the full store listing — the C-STATE-12 promise. */
export function snapshot(home: string): Record<string, string | null> {
  const out: Record<string, string | null> = {
    state: readOrNull(paths(home).stateFile),
    config: readOrNull(paths(home).configFile),
  };
  const store = join(home, "store");
  if (existsSync(store)) {
    for (const entry of new Bun.Glob("**/*").scanSync({ cwd: store, onlyFiles: true })) {
      out[`store/${entry}`] = readFileSync(join(store, entry), "utf8");
    }
  }
  return out;
}

let restoreAdapter: (() => void) | null = null;

/**
 * Pin the platform scheduler to "not loaded" and redirect Claude Code
 * at a scratch dir, so the dev machine's real launchd state and real
 * skills directory can't leak into doctor's findings.
 */
export function pinDoctorEnv(): void {
  setAutoupdatePlatform("darwin");
  setLaunchctlRunner(() => false);
  const root = makeTempDir("crew-cc-");
  const original = { u: claudeCodeAdapter.userPath, d: claudeCodeAdapter.detect };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => root;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  restoreAdapter = () => {
    (claudeCodeAdapter as { userPath: () => string }).userPath = original.u;
    (claudeCodeAdapter as { detect: () => boolean }).detect = original.d;
  };
}

export function unpinDoctorEnv(): void {
  resetAutoupdatePlatform();
  resetLaunchctlRunner();
  if (restoreAdapter) restoreAdapter();
  restoreAdapter = null;
}

/** A project-scope entry pointing at `root`, for missing-root cases. */
export function projectEntry(root: string): StateEntry {
  return {
    name: "demo",
    source: { tap: "core", path: "demo" },
    ref: null,
    resolved_sha: null,
    content_hash: "sha256:0",
    scope: "project",
    installed_at: "2026-01-01T00:00:00Z",
    agents: [],
    pinned: false,
    explicit: true,
    project_root: root,
    required_by: [],
  };
}
