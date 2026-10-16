/**
 * A repository whose root is one skill has no siblings, at a ref or not
 * (§9 step 3, step 6).
 *
 * At `@<ref>` the root skill is read from a scratch export under crew's
 * own cache, so "beside it" is other scratch directories — never the
 * source. A bare dependency must not be satisfied from there.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { paths } from "../../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeGitRepo, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { tag } from "./helpers.ts";

let ccRoot = "";
let ccOriginal: { userPath: () => string; detect: () => boolean };
beforeEach(() => {
  ccRoot = makeTempDir("crew-root-sibling-agent-");
  ccOriginal = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
  claudeCodeAdapter.userPath = () => ccRoot;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = ccOriginal.userPath;
  claudeCodeAdapter.detect = ccOriginal.detect;
});

test("a pinned root skill's bare dependency isn't taken from crew's cache", () => {
  const repo = makeTempDir("crew-root-skill-");
  const parent = skillFrontmatter({ name: "parent", dependencies: ["sib"] });
  writeFileSync(join(repo, "SKILL.md"), `---\n${parent}\n---\n`);
  makeGitRepo(repo, "one");
  tag(repo, "v1");

  const home = makeCrewHome();
  // A leftover scratch export that happens to hold a skill named `sib`.
  const leftover = join(paths(home).gitCacheDir, "deadbeef-leftover");
  mkdirSync(leftover, { recursive: true });
  writeFileSync(join(leftover, "SKILL.md"), `---\n${skillFrontmatter({ name: "sib" })}\n---\n`);

  const code = runCli(["install", `file://${repo}@v1`], {
    home,
    streams: captureStreams().streams,
  });

  expect(code).not.toBe(0);
  expect(existsSync(join(ccRoot, "sib"))).toBe(false);
});
