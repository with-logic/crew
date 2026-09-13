/**
 * Updating an entry installed at an explicit `@<ref>` (§10.1 step 3).
 */

import { describe, expect, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { runGit } from "../../../src/git/exec.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { commitAll, makeSkill, skillFrontmatter } from "../../helpers/fixtures.ts";
import { installedBody, retag, tag, twoCommitRepo, useRedirectedAdapter } from "./helpers.ts";

useRedirectedAdapter();

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

  test("C-UPD-04d an entry whose ref vanished upstream fails hard and keeps the install", () => {
    // The cheap pre-resolve can't answer for a ref that no longer
    // exists locally; the update falls through to full acquisition,
    // which fetches and then reports the ref as gone.
    const home = makeCrewHome();
    const { repo } = twoCommitRepo();
    runCli(["install", `file://${repo}@v1//demo`], { home, streams: captureStreams().streams });
    const before = installedBody();
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
    expect(installedBody()).toBe(before);
    expect(readState(home).installations[0]!.resolved_sha).toBe(beforeSha);
  });

  test("C-UPD-16b a whole-tap install at a ref re-expands at that ref", () => {
    const home = makeCrewHome();
    const { repo } = twoCommitRepo();
    // At `v1` the tap holds only `demo`.
    runCli(["install", `file://${repo}@v1`], { home, streams: captureStreams().streams });

    // A sibling added on the default branch only — it does not exist at v1.
    makeSkill(
      repo,
      "newbie",
      skillFrontmatter({ name: "newbie", description: "HEAD ONLY" }),
      "n\n",
    );
    commitAll(repo, "add newbie");

    const code = runCli(["update"], { home, streams: captureStreams().streams });

    expect(code).toBe(0);
    // Re-expanding against HEAD would install `newbie` and record it as
    // an unpinned no-ref entry, attributing default-branch bytes to a
    // group that asked for v1.
    const names = readState(home).installations.map((e) => e.name);
    expect(names).toEqual(["demo"]);
  });

  test("C-UPD-16b a child present at the tracked branch is installed carrying that ref", () => {
    const home = makeCrewHome();
    const { repo } = twoCommitRepo();
    // Track a BRANCH so re-expansion has something to discover later
    // while still reading a ref rather than the clone's checkout.
    runGit(["checkout", "--quiet", "-b", "track"], { cwd: repo });
    commitAll(repo, "branch point");
    runGit(["checkout", "--quiet", "main"], { cwd: repo });

    runCli(["install", `file://${repo}@track`], { home, streams: captureStreams().streams });
    expect(readState(home).installations.map((e) => e.name)).toEqual(["demo"]);

    // Add a sibling ON THE TRACKED BRANCH.
    runGit(["checkout", "--quiet", "track"], { cwd: repo });
    makeSkill(repo, "friend", skillFrontmatter({ name: "friend", description: "ON TRACK" }), "f\n");
    commitAll(repo, "add friend on track");
    runGit(["checkout", "--quiet", "main"], { cwd: repo });

    const code = runCli(["update"], { home, streams: captureStreams().streams });

    expect(code).toBe(0);
    const friend = readState(home).installations.find((e) => e.name === "friend");
    expect(friend).toBeDefined();
    // The child came from `track`, so it records that ref — not `null`,
    // which would claim a default-branch read.
    expect(friend!.ref).toBe("track");
    expect(friend!.pinned).toBe(false);
  });

  test("C-UPD-16c an unclassifiable failure exits 1, not 0", () => {
    // A scratch-export location crew cannot create is `source_unreachable`
    // (§9 step 3): the run must not report a `failed` row and exit 0.
    const home = makeCrewHome();
    const { repo } = twoCommitRepo();
    runCli(["install", `file://${repo}@v1//demo`], { home, streams: captureStreams().streams });
    const before = installedBody();

    writeFileSync(
      join(repo, "demo", "SKILL.md"),
      `---\n${skillFrontmatter({ name: "demo", description: "VERSION THREE" })}\n---\nthree\n`,
    );
    commitAll(repo, "three");
    retag(repo, "v1");

    // `cache` as a FILE makes the scratch directory uncreatable.
    rmSync(join(home, "cache"), { recursive: true, force: true });
    writeFileSync(join(home, "cache"), "not a dir\n");

    const cap = captureStreams();
    const code = runCli(["update", "--force", "--json"], { home, streams: cap.streams });

    expect(code).toBe(1);
    const payload = JSON.parse(cap.stdout()) as {
      rows: { outcome: { kind: string; error?: { code: string } } }[];
    };
    expect(payload.rows[0]!.outcome.kind).toBe("failed");
    expect(payload.rows[0]!.outcome.error?.code).toBe("source_unreachable");
    // The working install survives a failure to materialize the update.
    expect(installedBody()).toBe(before);
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
