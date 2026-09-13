/**
 * Shared fixtures for the scope-targeting uninstall tests (§7.4 "Scope").
 *
 * `crew uninstall --scope` and its `--prune` interaction both need the
 * same setup: one detectable adapter redirected at a temp dir, and the
 * ability to install a named skill at user or project scope in an
 * arbitrary cwd. Both test files share this rather than duplicating the
 * adapter reassignment dance, which keeps each file under the 200-line
 * cap while leaving the redirection explicit at the call site.
 */

import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { runCli } from "../../src/cli/main.ts";
import { readState } from "../../src/state/load.ts";
import { captureStreams } from "./env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "./fixtures.ts";

interface AdapterOriginals {
  user: () => string;
  project: (cwd: string) => string;
  detect: () => boolean;
}

/** Streams that swallow output; these tests assert on state, not text. */
export function quiet() {
  return captureStreams().streams;
}

/**
 * Point `claude-code` at a fresh temp dir and mark it detected. Returns
 * the originals so `afterEach` can restore them (see
 * `tests/e2e/install.test.ts` for the convention).
 */
export function redirectClaudeCode(): { userRoot: string; originals: AdapterOriginals } {
  const userRoot = makeTempDir("crew-cc-");
  const originals: AdapterOriginals = {
    user: claudeCodeAdapter.userPath,
    project: claudeCodeAdapter.projectPath,
    detect: claudeCodeAdapter.detect,
  };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => userRoot;
  (claudeCodeAdapter as { projectPath: (c: string) => string }).projectPath = (c) =>
    join(c, ".claude", "skills");
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  return { userRoot, originals };
}

/** Undo `redirectClaudeCode`. */
export function restoreClaudeCode(originals: AdapterOriginals): void {
  (claudeCodeAdapter as { userPath: () => string }).userPath = originals.user;
  (claudeCodeAdapter as { projectPath: (c: string) => string }).projectPath = originals.project;
  (claudeCodeAdapter as { detect: () => boolean }).detect = originals.detect;
}

/**
 * Install a standalone skill named `name` at `scope`, from `cwd`.
 * Returns the exit code so the caller can assert on it inside its own
 * `test()` — assertions can't live in a helper, and an unreachable
 * `throw` guard here would cost line coverage.
 */
export function installSkill(
  home: string,
  name: string,
  scope: "user" | "project",
  cwd: string,
): number {
  const src = makeTempDir("crew-src-");
  const skill = makeSkill(src, name, skillFrontmatter({ name }));
  const args = scope === "project" ? ["install", "--scope", "project", skill] : ["install", skill];
  return runCli(args, { home, cwd, streams: quiet() });
}

/**
 * Install `parent` (which declares `dep` as a crew dependency) plus the
 * dependency itself, at `scope` from `cwd`. The dep lands as a
 * non-explicit entry, which is what `--prune` sweeps. Returns the exit
 * code for the caller to assert on.
 */
export function installWithDep(
  home: string,
  parent: string,
  dep: string,
  scope: "user" | "project",
  cwd: string,
): number {
  const src = makeTempDir("crew-src-");
  makeSkill(src, dep, skillFrontmatter({ name: dep }));
  makeSkill(src, parent, skillFrontmatter({ name: parent, dependencies: [dep] }));
  const target = join(src, parent);
  const args =
    scope === "project" ? ["install", "--scope", "project", target] : ["install", target];
  return runCli(args, { home, cwd, streams: quiet() });
}

/**
 * Install a three-deep chain `parent -> middle -> leaf` at user scope:
 * `parent` explicit, the other two pulled in as dependencies. Lets a
 * test protect the MIDDLE node and assert the leaf survives. Returns the
 * exit code for the caller to assert on.
 */
export function installChain(
  home: string,
  parent: string,
  middle: string,
  leaf: string,
  cwd: string,
): number {
  const src = makeTempDir("crew-src-");
  makeSkill(src, leaf, skillFrontmatter({ name: leaf }));
  makeSkill(src, middle, skillFrontmatter({ name: middle, dependencies: [leaf] }));
  makeSkill(src, parent, skillFrontmatter({ name: parent, dependencies: [middle] }));
  return runCli(["install", join(src, parent)], { home, cwd, streams: quiet() });
}

/** Sorted `scope` / `project:<root>` labels for every entry named `name`. */
export function locationsOf(home: string, name: string): string[] {
  return readState(home)
    .installations.filter((e) => e.name === name)
    .map((e) => (e.scope === "user" ? "user" : `project:${e.project_root}`))
    .sort();
}

/** Every installed skill name in `state.json`, sorted. */
export function installedNames(home: string): string[] {
  return readState(home)
    .installations.map((e) => e.name)
    .sort();
}
