/**
 * Installing and updating at an explicit `@<ref>` (§8.2, §9 step 3, §10.1).
 *
 * Every test builds a real local repo with two commits — A (tagged `v1`)
 * and B (HEAD) — whose SKILL.md differs, so "which commit did we read"
 * is visible in the installed bytes rather than inferred.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { runCli } from "../../src/cli/main.ts";
import { paths } from "../../src/core/paths.ts";
import { runGit } from "../../src/git/exec.ts";
import { readState } from "../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

let restore: (() => void) | null = null;
let ccRoot = "";

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

interface TwoCommitRepo {
  readonly repo: string;
  readonly shaA: string;
  readonly shaB: string;
}

/** Repo with `demo/` at two commits; A is tagged `v1`, B is HEAD. */
function twoCommitRepo(): TwoCommitRepo {
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

/** Lightweight, unsigned tag at the repo's current HEAD. */
function tag(repo: string, name: string): void {
  runGit(["-c", "tag.gpgSign=false", "-c", "tag.forceSignAnnotated=false", "tag", name], {
    cwd: repo,
  });
}

/** Move an existing tag to the current HEAD. */
function retag(repo: string, name: string): void {
  runGit(["-c", "tag.gpgSign=false", "-c", "tag.forceSignAnnotated=false", "tag", "-f", name], {
    cwd: repo,
  });
}

function installedBody(): string {
  return readFileSync(join(ccRoot, "demo", "SKILL.md"), "utf8");
}

describe("installing at an explicit ref", () => {
  test("C-INST-05b install at a tag uses the tag's commit, not HEAD", () => {
    const home = makeCrewHome();
    const { repo, shaA } = twoCommitRepo();
    const cap = captureStreams();
    const code = runCli(["install", `file://${repo}@v1//demo`], { home, streams: cap.streams });

    expect(code).toBe(0);
    expect(installedBody()).toContain("VERSION ONE");
    const entry = readState(home).installations.find((e) => e.name === "demo")!;
    expect(entry.resolved_sha).toBe(shaA);
    expect(entry.ref).toBe("v1");
    expect(entry.pinned).toBe(true);
  });

  test("C-INST-05b install at an exact SHA uses that commit", () => {
    const home = makeCrewHome();
    const { repo, shaA } = twoCommitRepo();
    const code = runCli(["install", `file://${repo}@${shaA}//demo`], {
      home,
      streams: captureStreams().streams,
    });

    expect(code).toBe(0);
    expect(installedBody()).toContain("VERSION ONE");
    expect(readState(home).installations[0]!.resolved_sha).toBe(shaA);
  });

  test("C-INST-05b install at a branch tracks the branch head, unpinned", () => {
    const home = makeCrewHome();
    const { repo, shaB } = twoCommitRepo();
    const code = runCli(["install", `file://${repo}@main//demo`], {
      home,
      streams: captureStreams().streams,
    });

    expect(code).toBe(0);
    expect(installedBody()).toContain("VERSION TWO");
    const entry = readState(home).installations[0]!;
    expect(entry.resolved_sha).toBe(shaB);
    expect(entry.pinned).toBe(false);
  });

  test("C-INST-05b a tap-source ref reads that commit", () => {
    const home = makeCrewHome();
    const { repo, shaA } = twoCommitRepo();
    runCli(["tap", "add", `file://${repo}`, "acme"], { home, streams: captureStreams().streams });

    const code = runCli(["install", "acme/demo@v1"], { home, streams: captureStreams().streams });

    expect(code).toBe(0);
    expect(installedBody()).toContain("VERSION ONE");
    expect(readState(home).installations[0]!.resolved_sha).toBe(shaA);
  });

  test("C-INST-05c an unknown ref is ref_not_found, exit 5", () => {
    const home = makeCrewHome();
    const { repo } = twoCommitRepo();
    const cap = captureStreams();
    const code = runCli(["install", `file://${repo}@nope//demo`], { home, streams: cap.streams });

    expect(code).toBe(5);
    expect(cap.stderr()).toContain("nope");
  });

  test("C-INST-05b a subpath absent at the ref reports no_skills_found", () => {
    const home = makeCrewHome();
    const { repo } = twoCommitRepo();
    // `later/` only exists on HEAD, not at the tagged commit.
    makeSkill(repo, "later", skillFrontmatter({ name: "later" }), "later\n");
    commitAll(repo, "add later");

    const cap = captureStreams();
    const code = runCli(["install", `file://${repo}@v1//later`], { home, streams: cap.streams });

    expect(code).toBe(4);
    expect(cap.stderr()).toContain("later");
  });

  test("C-INST-05d the shared clone stays put and no scratch dirs leak", () => {
    const home = makeCrewHome();
    const { repo, shaB } = twoCommitRepo();
    runCli(["install", `file://${repo}@v1//demo`], { home, streams: captureStreams().streams });

    const clone = join(paths(home).tapsDir, readdirSync(paths(home).tapsDir)[0]!);
    expect(runGit(["rev-parse", "HEAD"], { cwd: clone }).stdout.trim()).toBe(shaB);

    const gitCache = paths(home).gitCacheDir;
    expect(existsSync(gitCache) ? readdirSync(gitCache) : []).toEqual([]);
  });

  test("C-STATE-04b content_hash is the ref's bytes, not HEAD's", () => {
    const home = makeCrewHome();
    const { repo } = twoCommitRepo();
    runCli(["install", `file://${repo}@v1//demo`], { home, streams: captureStreams().streams });
    const pinnedHash = readState(home).installations[0]!.content_hash;

    const other = makeCrewHome();
    runCli(["install", `file://${repo}//demo`], { home: other, streams: captureStreams().streams });
    const headHash = readState(other).installations[0]!.content_hash;

    expect(pinnedHash).not.toBe(headHash);
  });
});

describe("crew info at an explicit ref", () => {
  test("C-INST-05b info previews the ref's content", () => {
    const home = makeCrewHome();
    const { repo } = twoCommitRepo();
    const cap = captureStreams();
    const code = runCli(["info", `file://${repo}@v1//demo`, "--json"], {
      home,
      streams: cap.streams,
    });

    expect(code).toBe(0);
    const payload = JSON.parse(cap.stdout()) as { skills: { description: string }[] };
    expect(payload.skills[0]!.description).toBe("VERSION ONE");
  });
});

describe("updating an entry installed at a ref", () => {
  test("C-UPD-04b --force on a moved tag installs the tag's new commit", () => {
    const home = makeCrewHome();
    const { repo } = twoCommitRepo();
    runCli(["install", `file://${repo}@v1//demo`], { home, streams: captureStreams().streams });
    expect(installedBody()).toContain("VERSION ONE");

    writeFileSync(
      join(repo, "demo", "SKILL.md"),
      `---\n${skillFrontmatter({ name: "demo", description: "VERSION THREE" })}\n---\nthree\n`,
    );
    const shaC = commitAll(repo, "three");
    retag(repo, "v1");

    expect(runCli(["update"], { home, streams: captureStreams().streams })).toBe(0);
    expect(installedBody()).toContain("VERSION ONE");

    const code = runCli(["update", "--force"], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
    expect(installedBody()).toContain("VERSION THREE");
    expect(readState(home).installations[0]!.resolved_sha).toBe(shaC);
  });

  test("C-UPD-04c a branch-installed entry follows that branch", () => {
    const home = makeCrewHome();
    const { repo } = twoCommitRepo();
    runGit(["checkout", "--quiet", "-b", "side"], { cwd: repo });
    writeFileSync(
      join(repo, "demo", "SKILL.md"),
      `---\n${skillFrontmatter({ name: "demo", description: "SIDE ONE" })}\n---\nside one\n`,
    );
    commitAll(repo, "side one");
    runGit(["checkout", "--quiet", "main"], { cwd: repo });

    runCli(["install", `file://${repo}@side//demo`], { home, streams: captureStreams().streams });
    expect(installedBody()).toContain("SIDE ONE");

    runGit(["checkout", "--quiet", "side"], { cwd: repo });
    writeFileSync(
      join(repo, "demo", "SKILL.md"),
      `---\n${skillFrontmatter({ name: "demo", description: "SIDE TWO" })}\n---\nside two\n`,
    );
    const sideTwo = commitAll(repo, "side two");
    runGit(["checkout", "--quiet", "main"], { cwd: repo });

    const code = runCli(["update"], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
    expect(installedBody()).toContain("SIDE TWO");
    expect(readState(home).installations[0]!.resolved_sha).toBe(sideTwo);
  });

  test("C-INST-05c a tag published after the clone is fetched and resolved", () => {
    const home = makeCrewHome();
    const { repo } = twoCommitRepo();
    // Clone the tap first, so `v2` does not exist locally yet.
    runCli(["install", `file://${repo}//demo`], { home, streams: captureStreams().streams });

    writeFileSync(
      join(repo, "demo", "SKILL.md"),
      `---\n${skillFrontmatter({ name: "demo-two", description: "LATER TAG" })}\n---\nlater\n`,
    );
    const shaC = commitAll(repo, "later");
    tag(repo, "v2");

    const other = makeCrewHome();
    const code = runCli(["install", `file://${repo}@v2//demo`], {
      home: other,
      streams: captureStreams().streams,
    });

    expect(code).toBe(0);
    expect(readState(other).installations[0]!.resolved_sha).toBe(shaC);
  });
});
