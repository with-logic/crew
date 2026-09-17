/**
 * Shared fixtures for the `crew update --dry-run` suites (§10.1.1).
 *
 * The adapter redirection and the "what must not change" snapshot are
 * used by every scenario file, so they live here rather than being
 * copied per file.
 */

import { afterEach, beforeEach } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { relative } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { paths } from "../../../src/core/paths.ts";
import type { TapReexpandRow } from "../../../src/install/tap-reexpand/index.ts";
import type { UpdateRow } from "../../../src/install/update/types.ts";
import { walk } from "../../../src/util/fs.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";

/** Mirrors the command's `--json` payload; discriminants keep their real types. */
export interface UpdateJson {
  readonly dry_run: boolean;
  readonly rows: readonly UpdateRow[];
  readonly tap_reexpand_rows: readonly TapReexpandRow[];
}

/** Claude Code's redirected skills root for the current test. */
export let ccRoot: string;

/**
 * Redirect the Claude Code adapter at its real seam, per the repo's
 * test convention, and restore afterwards.
 */
export function redirectClaudeCode(): void {
  let originalUserPath: () => string;
  let originalDetect: () => boolean;

  beforeEach(() => {
    ccRoot = makeTempDir("crew-cc-");
    originalUserPath = claudeCodeAdapter.userPath;
    originalDetect = claudeCodeAdapter.detect;
    (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
    (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  });
  afterEach(() => {
    (claudeCodeAdapter as { userPath: () => string }).userPath = originalUserPath;
    (claudeCodeAdapter as { detect: () => boolean }).detect = originalDetect;
  });
}

/**
 * Every byte a dry run must leave untouched: `state.json`, the whole
 * store tree, and the whole installed tree — every file, not just
 * `SKILL.md`. A skill's resource files and the store's contents are as
 * much "installed state" as its frontmatter, so a preview that rewrote
 * a resource or restaged a store entry has to fail this.
 *
 * Tap clones are deliberately excluded: a dry run DOES fetch and check
 * them out (§10.1.1), which is how it learns what moved. They are the
 * one documented exception to "nothing is written".
 */
export function snapshotInstalledState(home: string): Record<string, string> {
  const out: Record<string, string> = {};
  out["state"] = readFileSync(paths(home).stateFile, "utf8");
  snapshotTree(out, paths(home).storeDir, "store");
  snapshotTree(out, ccRoot, "installed");
  return out;
}

/** Record every file under `root` by content, keyed by relative path. */
function snapshotTree(out: Record<string, string>, root: string, label: string): void {
  if (!existsSync(root)) return;
  for (const entry of walk(root)) {
    if (!entry.isFile) continue;
    out[`${label}:${relative(root, entry.absPath)}`] = readFileSync(entry.absPath, "utf8");
  }
}
