/**
 * Updating an entry installed at an explicit `@<ref>` (§10.1 step 3).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { runGit } from "../../../src/git/exec.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { commitAll, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { installedBody, retag, tag, twoCommitRepo } from "./helpers.ts";

let ccRoot = "";
let ccOriginal: { userPath: () => string; detect: () => boolean };
beforeEach(() => {
  ccRoot = makeTempDir("crew-requested-ref-agent-");
  ccOriginal = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
  claudeCodeAdapter.userPath = () => ccRoot;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = ccOriginal.userPath;
  claudeCodeAdapter.detect = ccOriginal.detect;
});

describe("updating an entry installed at a ref", () => {
  test("C-UPD-04b --force on a moved tag installs the tag's new commit", () => {
    const home = makeCrewHome();
    const { repo } = twoCommitRepo();
    runCli(["tap", "add", `file://${repo}`, "acme"], { home, streams: captureStreams().streams });
    runCli(["install", "acme/demo@v1"], { home, streams: captureStreams().streams });
    expect(installedBody(ccRoot)).toContain("VERSION ONE");

    writeFileSync(
      join(repo, "demo", "SKILL.md"),
      `---\n${skillFrontmatter({ name: "demo", description: "VERSION THREE" })}\n---\nthree\n`,
    );
    const shaC = commitAll(repo, "three");
    retag(repo, "v1");
    writeFileSync(
      join(repo, "demo", "SKILL.md"),
      `---\n${skillFrontmatter({ name: "demo", description: "HEAD FOUR" })}\n---\nfour\n`,
    );
    commitAll(repo, "advance HEAD beyond moved tag");
    rmSync(join(home, "cache"), { recursive: true, force: true });
    writeFileSync(join(home, "cache"), "not a directory\n");

    expect(runCli(["update"], { home, streams: captureStreams().streams })).toBe(0);
    expect(installedBody(ccRoot)).toContain("VERSION ONE");

    rmSync(join(home, "cache"));
    const code = runCli(["update", "--force"], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
    expect(installedBody(ccRoot)).toContain("VERSION THREE");
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
    expect(installedBody(ccRoot)).toContain("SIDE ONE");

    runGit(["checkout", "--quiet", "side"], { cwd: repo });
    writeFileSync(
      join(repo, "demo", "SKILL.md"),
      `---\n${skillFrontmatter({ name: "demo", description: "SIDE TWO" })}\n---\nside two\n`,
    );
    const sideTwo = commitAll(repo, "side two");
    runGit(["checkout", "--quiet", "main"], { cwd: repo });

    const code = runCli(["update"], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
    expect(installedBody(ccRoot)).toContain("SIDE TWO");
    expect(readState(home).installations[0]!.resolved_sha).toBe(sideTwo);
  });

  test("C-UPD-04d an entry whose ref vanished upstream fails hard and keeps the install", () => {
    // The cheap pre-resolve can't answer for a ref that no longer
    // exists locally; the update falls through to full acquisition,
    // which fetches and then reports the ref as gone.
    const home = makeCrewHome();
    const { repo } = twoCommitRepo();
    runCli(["install", `file://${repo}@v1//demo`], { home, streams: captureStreams().streams });
    const before = installedBody(ccRoot);
    const beforeSha = readState(home).installations[0]!.resolved_sha;

    runGit(["tag", "--delete", "v1"], { cwd: repo });

    const c = captureStreams();
    const code = runCli(["update"], { home, streams: c.streams });

    // A ref that no longer exists is a hard failure, not a silent
    // "up to date": without `--prune-tags` the fetch leaves the deleted
    // tag locally resolvable and this run would report success against
    // a ref upstream no longer has.
    expect(code).toBe(1);
    expect(c.stdout()).toContain("ref not found");
    // The local install survives — §10.1 keeps working bytes in place
    // when the source can no longer supply them.
    expect(installedBody(ccRoot)).toBe(before);
    expect(readState(home).installations[0]!.resolved_sha).toBe(beforeSha);
  });

  test("C-INST-05c a tag published after the clone is fetched and resolved", () => {
    const home = makeCrewHome();
    const { repo } = twoCommitRepo();
    // Clone the tap into THIS home, so `v2` genuinely does not exist in
    // the clone that the second install will resolve against — that is
    // the fetch-on-miss path. A fresh home would clone from scratch and
    // already have the tag, exercising nothing.
    runCli(["install", `file://${repo}//demo`], { home, streams: captureStreams().streams });

    writeFileSync(
      join(repo, "demo", "SKILL.md"),
      `---\n${skillFrontmatter({ name: "demo-two", description: "LATER TAG" })}\n---\nlater\n`,
    );
    const shaC = commitAll(repo, "later");
    tag(repo, "v2");

    const code = runCli(["install", `file://${repo}@v2//demo`], {
      home,
      streams: captureStreams().streams,
    });

    expect(code).toBe(0);
    const entry = readState(home).installations.find((e) => e.name === "demo-two");
    expect(entry?.resolved_sha).toBe(shaC);
  });
});
