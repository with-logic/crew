/**
 * Re-expanding a whole-tap install at its requested ref (§10.1 step 3).
 *
 * A group installed at an explicit ref must re-expand against THAT ref,
 * not the clone's checkout: discovering children at the default branch
 * would attribute those bytes to a group that asked for something else.
 * Per-entry ref behavior is `./update.test.ts`.
 */

import { describe, expect, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { runGit } from "../../../src/git/exec.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { commitAll, makeSkill, skillFrontmatter } from "../../helpers/fixtures.ts";
import { installedBody, retag, twoCommitRepo, useRedirectedAdapter } from "./helpers.ts";

useRedirectedAdapter();

describe("re-expanding a whole-tap install at its ref", () => {
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
});
