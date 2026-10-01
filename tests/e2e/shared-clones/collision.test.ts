/** Distinct repository identities cannot reuse another repository's bytes (§6, §9). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { readConfig } from "../../../src/config/load.ts";
import { repoDirName } from "../../../src/core/repo-path.ts";
import { resetGitRunner, setGitRunner } from "../../../src/git/exec.ts";
import { tapLockTarget } from "../../../src/sources/tap-lock.ts";
import { readState } from "../../../src/state/load.ts";
import { makeGitRepo, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { bareHome, run } from "./helpers.ts";

const originalUserPath = claudeCodeAdapter.userPath;
const originalDetect = claudeCodeAdapter.detect;
let agentDir: string;

beforeEach(() => {
  agentDir = makeTempDir("crew-collision-agent-");
  claudeCodeAdapter.userPath = () => agentDir;
  claudeCodeAdapter.detect = () => true;
});

afterEach(() => {
  claudeCodeAdapter.userPath = originalUserPath;
  claudeCodeAdapter.detect = originalDetect;
  resetGitRunner();
});

test("C-TAP-28 colliding short digests install the selected repository's bytes and SHA", () => {
  // This fixed pair collided under the former 32-bit directory suffix.
  const urls = [
    "file:///tmp/crew-pr132-collision-repos/8410/same/owner/repo",
    "file:///tmp/crew-pr132-collision-repos/69050/same/owner/repo",
  ];
  expect(createHash("sha256").update(urls[0]!).digest("hex").slice(0, 8)).toBe("60ef2fc4");
  expect(createHash("sha256").update(urls[1]!).digest("hex").slice(0, 8)).toBe("60ef2fc4");

  const repos = [makeTempDir("crew-collision-a-"), makeTempDir("crew-collision-b-")];
  const shas: string[] = [];
  for (const [i, repo] of repos.entries()) {
    makeSkill(repo, "demo", skillFrontmatter({ name: "demo", description: `Repository ${i}` }));
    shas.push(makeGitRepo(repo).sha);
  }
  // Keep the reproduced logical identities while real git reads unique local fixtures.
  // Only transport arguments change; Crew's config and clone identities keep the pair above.
  const transports = new Map(urls.map((url, i) => [url, `file://${repos[i]!}`]));
  const previous = setGitRunner((args, options) =>
    previous(
      args.map((arg) => transports.get(arg) ?? arg),
      options,
    ),
  );
  const home = bareHome();
  expect(run(home, ["tap", "add", urls[0]!, "first"]).code).toBe(0);
  expect(run(home, ["tap", "add", urls[1]!, "second"]).code).toBe(0);
  const taps = readConfig(home).taps;

  expect(run(home, ["install", "second/demo", "--agent", "claude-code"]).code).toBe(0);
  expect(readFileSync(join(agentDir, "demo", "SKILL.md"), "utf8")).toContain("Repository 1");
  const installed = readState(home).installations[0]!;
  expect(installed.resolved_sha).toBe(shas[1]!);
  expect(installed.resolved_sha).not.toBe(shas[0]!);
  expect(installed.source).toEqual({ tap: "second", path: "demo" });
  expect(repoDirName(urls[0]!)).not.toBe(repoDirName(urls[1]!));
  expect(tapLockTarget(taps[0]!, home)).not.toBe(tapLockTarget(taps[1]!, home));
});
