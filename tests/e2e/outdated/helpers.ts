/**
 * Shared fixtures for the `crew outdated` e2e suites (§10.1.1).
 *
 * Each suite redirects the Claude Code adapter to its own temp root
 * via `useClaudeCodeRoot()`, then builds local `file://` git taps —
 * no test here ever contacts the network.
 */

import { afterEach, beforeEach } from "bun:test";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { paths } from "../../../src/core/paths.ts";
import { runGit } from "../../../src/git/exec.ts";
import { walk } from "../../../src/util/fs.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

/** Where the redirected Claude Code adapter installs during a test. */
export const ccRoot = { path: "" };

/** Point the Claude Code adapter at a per-test temp dir; restore after. */
export function useClaudeCodeRoot(): void {
  let originalUserPath: () => string;
  let originalDetect: () => boolean;
  beforeEach(() => {
    ccRoot.path = makeTempDir("crew-cc-");
    originalUserPath = claudeCodeAdapter.userPath;
    originalDetect = claudeCodeAdapter.detect;
    (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot.path;
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
 * `SKILL.md` and the marker. A skill's resource files and the store's
 * contents are as much "installed state" as its frontmatter, so a
 * preview that rewrote a resource or restaged a store entry has to
 * fail this. Name-only store comparison would miss a restage that
 * reused the same `<name>@<short-sha>` directory.
 *
 * Tap clones are deliberately excluded: a dry run DOES fetch and check
 * them out (§10.1.1), which is how it learns what moved.
 */
export function snapshot(home: string): Record<string, string> {
  const out: Record<string, string> = {};
  out["state"] = readFileSync(paths(home).stateFile, "utf8");
  snapshotTree(out, paths(home).storeDir, "store");
  snapshotTree(out, ccRoot.path, "installed");
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

/** Fresh home with the default tap removed and one skill installed from a local git repo. */
export function installedFromRepo(): { home: string; repo: string } {
  const home = makeCrewHome();
  runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
  const repo = makeTempDir("crew-outdated-");
  makeGitRepo(repo);
  makeSkill(repo, "alpha", skillFrontmatter({ name: "alpha", description: "v1" }), "body v1\n");
  commitAll(repo, "v1");
  runCli(["install", `file://${repo}`], { home, streams: captureStreams().streams });
  return { home, repo };
}

/** Install a second, independent tap into an existing home. */
export function addSecondRepo(home: string, skill: string): string {
  const repo = makeTempDir("crew-second-");
  makeGitRepo(repo);
  makeSkill(repo, skill, skillFrontmatter({ name: skill, description: "v1" }), "body v1\n");
  commitAll(repo, "v1");
  runCli(["install", `file://${repo}`], { home, streams: captureStreams().streams });
  return repo;
}

/** Bump a skill's SKILL.md and commit, so upstream is ahead of the install. */
export function moveUpstream(repo: string, skill: string): void {
  writeFileSync(
    join(repo, skill, "SKILL.md"),
    `---\n${skillFrontmatter({ name: skill, description: "v2" })}\n---\nbody v2\n`,
  );
  commitAll(repo, "v2");
}

/** Current HEAD of every tap clone, keyed by tap name. */
export function tapHeads(home: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tap of readdirSync(paths(home).tapsDir)) {
    out[tap] = runGit(["rev-parse", "HEAD"], {
      cwd: join(paths(home).tapsDir, tap),
    }).stdout.trim();
  }
  return out;
}

/** Point a tap clone's origin at a path that does not exist. */
export function breakTapOrigin(home: string, tapName: string): void {
  runGit(["remote", "set-url", "origin", "file:///does/not/exist/crew-gone"], {
    cwd: join(paths(home).tapsDir, tapName),
  });
}
