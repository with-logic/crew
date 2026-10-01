/**
 * Installing at an explicit `@<ref>` (§8.2, §9 step 3).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { paths } from "../../../src/core/paths.ts";
import { repoClonePath } from "../../../src/core/repo-path.ts";
import { runGit } from "../../../src/git/exec.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { commitAll, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { installedBody, repoWithSkillDeletedAtHead, twoCommitRepo } from "./helpers.ts";

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

describe("installing at an explicit ref", () => {
  test("C-INST-05b install at a tag uses the tag's commit, not HEAD", () => {
    const home = makeCrewHome();
    const { repo, shaA } = twoCommitRepo();
    const cap = captureStreams();
    const code = runCli(["install", `file://${repo}@v1//demo`], { home, streams: cap.streams });

    expect(code).toBe(0);
    expect(installedBody(ccRoot)).toContain("VERSION ONE");
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
    expect(installedBody(ccRoot)).toContain("VERSION ONE");
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
    expect(installedBody(ccRoot)).toContain("VERSION TWO");
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
    expect(installedBody(ccRoot)).toContain("VERSION ONE");
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
    runCli(["tap", "add", `file://${repo}`, "acme"], { home, streams: captureStreams().streams });
    const clone = repoClonePath(`file://${repo}`, home);
    const index = readFileSync(join(clone, ".git", "index"));
    const bytes = readFileSync(join(clone, "demo", "SKILL.md"));
    expect(runCli(["install", "acme/demo@v1"], { home, streams: captureStreams().streams })).toBe(
      0,
    );
    expect(readFileSync(join(clone, ".git", "index"))).toEqual(index);
    expect(readFileSync(join(clone, "demo", "SKILL.md"))).toEqual(bytes);
    expect(runGit(["rev-parse", "HEAD"], { cwd: clone }).stdout.trim()).toBe(shaB);

    const gitCache = paths(home).gitCacheDir;
    expect(existsSync(gitCache) ? readdirSync(gitCache) : []).toEqual([]);
  });

  test("C-INST-05e a qualified ref finds a skill deleted at HEAD", () => {
    const home = makeCrewHome();
    const { repo } = repoWithSkillDeletedAtHead();
    runCli(["tap", "add", `file://${repo}`, "acme"], { home, streams: captureStreams().streams });

    const cap = captureStreams();
    const code = runCli(["install", "acme/gone@v2"], { home, streams: cap.streams });

    expect(code).toBe(0);
    const entry = readState(home).installations.find((e) => e.name === "gone")!;
    expect(entry.ref).toBe("v2");
    expect(entry.pinned).toBe(true);
  });

  test("C-INST-05e a BARE name at a ref finds a skill deleted at HEAD", () => {
    // The bare name doesn't say which tap to look in, so resolution
    // itself has to read the requested commit across the tap set —
    // indexing the live clone would never see `gone` at all.
    const home = makeCrewHome();
    const { repo } = repoWithSkillDeletedAtHead();
    runCli(["tap", "add", `file://${repo}`, "acme"], { home, streams: captureStreams().streams });

    const cap = captureStreams();
    const code = runCli(["install", "gone@v2"], { home, streams: cap.streams });

    expect(code).toBe(0);
    const entry = readState(home).installations.find((e) => e.name === "gone")!;
    expect(entry.ref).toBe("v2");
    expect(entry.source.tap).toBe("acme");
  });

  test("C-INST-05e a bare name absent at the ref is still invalid_ref", () => {
    // `demo` exists, but not at a ref no tap can supply: resolution must
    // report the miss rather than silently falling back to HEAD.
    const home = makeCrewHome();
    const { repo } = repoWithSkillDeletedAtHead();
    runCli(["tap", "add", `file://${repo}`, "acme"], { home, streams: captureStreams().streams });

    const cap = captureStreams();
    const code = runCli(["install", "nosuchskill@v2"], { home, streams: cap.streams });

    expect(code).toBe(4);
    expect(cap.stderr()).toContain("nosuchskill");
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
