/**
 * Missing-ref fetches cannot relabel live checkout bytes (§9 step 3, §11.1).
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { tapPath } from "../../../src/core/paths.ts";
import type { Marker } from "../../../src/core/types.ts";
import { runGit } from "../../../src/git/exec.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

const originalPath = claudeCodeAdapter.userPath;
const originalDetect = claudeCodeAdapter.detect;
let installDir: string;

beforeEach(() => {
  installDir = makeTempDir("crew-live-checkout-installs-");
  claudeCodeAdapter.userPath = () => installDir;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = originalPath;
  claudeCodeAdapter.detect = originalDetect;
});

for (const reference of ["acme/demo", "demo"]) {
  test(`C-INST-05d missing-ref preview keeps ${reference} SHA paired with checkout bytes`, () => {
    const home = makeCrewHome();
    const repo = makeTempDir("crew-live-checkout-repo-");
    makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }), "OLD CHECKOUT\n");
    const { sha: oldSha } = makeGitRepo(repo);
    const invoke = (args: string[]) => runCli(args, { home, streams: captureStreams().streams });
    expect(invoke(["tap", "add", `file://${repo}`, "acme"])).toBe(0);
    const clone = tapPath("acme", home);
    const indexBefore = readFileSync(join(clone, ".git/index"));
    const skillBefore = readFileSync(join(clone, "demo/SKILL.md"));
    makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }), "NEW UPSTREAM\n");
    const newSha = commitAll(repo, "advance upstream after cloning");

    expect(invoke(["info", "acme/demo@missing"])).not.toBe(0);
    expect(runGit(["rev-parse", "refs/remotes/origin/HEAD"], { cwd: clone }).stdout.trim()).toBe(
      newSha,
    );
    expect(runGit(["rev-parse", "HEAD"], { cwd: clone }).stdout.trim()).toBe(oldSha);
    expect(readFileSync(join(clone, ".git/index"))).toEqual(indexBefore);
    expect(readFileSync(join(clone, "demo/SKILL.md"))).toEqual(skillBefore);

    expect(invoke(["install", reference])).toBe(0);
    expect(readFileSync(join(installDir, "demo/SKILL.md"), "utf8")).toContain("OLD CHECKOUT");
    expect(readState(home).installations[0]!.resolved_sha).toBe(oldSha);
    const marker = JSON.parse(readFileSync(join(installDir, "demo/.crew.json"), "utf8")) as Marker;
    expect(marker.resolved_sha).toBe(oldSha);

    expect(invoke(["update", "demo"])).toBe(0);
    expect(readFileSync(join(installDir, "demo/SKILL.md"), "utf8")).toContain("NEW UPSTREAM");
    expect(readState(home).installations[0]!.resolved_sha).toBe(newSha);
  });
}
