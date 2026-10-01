/**
 * Shared fixtures for the explicit-`@<ref>` suites (§8.2, §9 step 3, §10.1).
 *
 * Every test builds a real local repo with two commits — A (tagged `v1`)
 * and B (HEAD) — whose SKILL.md differs, so "which commit did we read"
 * is visible in the installed bytes rather than inferred.
 */

import { afterEach, beforeEach } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runGit } from "../../../src/git/exec.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

let restore: (() => void) | null = null;
let ccRoot = "";

/** Redirect Claude Code at a temp dir for the duration of each test. */
export function useRedirectedAdapter(): void {
  beforeEach(() => {
    ccRoot = makeTempDir("crew-cc-");
    const orig = { u: claudeCodeAdapter.userPath, d: claudeCodeAdapter.detect };
    (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
    (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
    restore = () => {
      (claudeCodeAdapter as { userPath: () => string }).userPath = orig.u;
      (claudeCodeAdapter as { detect: () => boolean }).detect = orig.d;
    };
  });

  afterEach(() => {
    if (restore) restore();
    restore = null;
  });
}

/** Where the redirected adapter installs to. */
export function adapterRoot(): string {
  return ccRoot;
}

export interface TwoCommitRepo {
  readonly repo: string;
  readonly shaA: string;
  readonly shaB: string;
}

/** Repo with `demo/` at two commits; A is tagged `v1`, B is HEAD. */
export function twoCommitRepo(): TwoCommitRepo {
  const repo = makeTempDir("crew-pinrepo-");
  makeSkill(repo, "demo", skillFrontmatter({ name: "demo", description: "VERSION ONE" }), "one\n");
  const { sha: shaA } = makeGitRepo(repo, "one");
  tag(repo, "v1");
  writeFileSync(
    join(repo, "demo", "SKILL.md"),
    `---\n${skillFrontmatter({ name: "demo", description: "VERSION TWO" })}\n---\ntwo\n`,
  );
  const shaB = commitAll(repo, "two");
  return { repo, shaA, shaB };
}

/**
 * Repo where `gone` exists at tag `v2` but is deleted at HEAD, alongside
 * `demo` from `twoCommitRepo`. Exercises §9 step 3's rule that a skill
 * present at a ref must still resolve after deletion on the default branch.
 */
export function repoWithSkillDeletedAtHead(): { repo: string } {
  const { repo } = twoCommitRepo();
  makeSkill(repo, "gone", skillFrontmatter({ name: "gone", description: "GONE ONE" }), "g\n");
  commitAll(repo, "add gone");
  tag(repo, "v2");
  rmSync(join(repo, "gone"), { recursive: true });
  commitAll(repo, "remove gone");
  return { repo };
}

/** Lightweight, unsigned tag at the repo's current HEAD. */
export function tag(repo: string, name: string): void {
  runGit(["-c", "tag.gpgSign=false", "-c", "tag.forceSignAnnotated=false", "tag", name], {
    cwd: repo,
  });
}

/** Move an existing tag to the current HEAD. */
export function retag(repo: string, name: string): void {
  runGit(["-c", "tag.gpgSign=false", "-c", "tag.forceSignAnnotated=false", "tag", "-f", name], {
    cwd: repo,
  });
}

/** Bytes of the installed `demo` skill. */
export function installedBody(): string {
  return readFileSync(join(ccRoot, "demo", "SKILL.md"), "utf8");
}
