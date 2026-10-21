/** Same-commit directory dependencies share one captured export (§9 steps 3, 6). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../../src/agents/claude-code.ts";
import { runCli } from "../../../../src/cli/main.ts";
import { storeEntryPath } from "../../../../src/core/paths.ts";
import { resetGitRunner } from "../../../../src/git/exec.ts";
import { hashDirectory } from "../../../../src/hash/content.ts";
import { readState } from "../../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../../helpers/fixtures.ts";
import { captureExports } from "./helpers.ts";

let agentRoot = "";
let original: { userPath: () => string; detect: () => boolean };
beforeEach(() => {
  agentRoot = makeTempDir("crew-dependency-cache-agent-");
  original = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
  claudeCodeAdapter.userPath = () => agentRoot;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = original.userPath;
  claudeCodeAdapter.detect = original.detect;
  resetGitRunner();
});

test("C-INST-05f a same-SHA sibling chain exports its enclosing directory once", () => {
  const repo = makeTempDir("crew-dependency-cache-repo-");
  const names = ["alpha", "beta", "gamma", "delta"];
  const bodies = new Map<string, string>();
  for (const [i, name] of names.entries()) {
    const next = names[i + 1];
    const dir = makeSkill(
      join(repo, "skills", "team"),
      name,
      skillFrontmatter({ name, dependencies: next ? [next] : [] }),
      `${name} captured bytes\n`,
    );
    bodies.set(name, readFileSync(join(dir, "SKILL.md"), "utf8"));
  }
  const { sha } = makeGitRepo(repo);
  for (const [i, name] of names.entries()) {
    const next = names[i + 1];
    makeSkill(
      join(repo, "skills", "team"),
      name,
      skillFrontmatter({ name, dependencies: next ? [next] : [] }),
      `${name} HEAD bytes\n`,
    );
  }
  commitAll(repo, "move all siblings past the captured commit");
  const home = makeCrewHome();
  const { roots } = captureExports();
  const capture = captureStreams();
  expect(
    runCli(["install", "--agent", "claude-code", `file://${repo}@${sha}//skills/team/alpha`], {
      home,
      streams: capture.streams,
    }),
  ).toBe(0);
  const state = readState(home);
  for (const name of names) {
    expect(readFileSync(join(agentRoot, name, "SKILL.md"), "utf8")).toBe(bodies.get(name)!);
    const entry = state.installations.find((item) => item.name === name)!;
    expect(entry.resolved_sha).toBe(sha);
    expect(entry.ref).toBe(sha);
    expect(entry.pinned).toBe(true);
    const store = storeEntryPath(name, sha.slice(0, 8), home);
    expect(readFileSync(join(store, "SKILL.md"), "utf8")).toBe(bodies.get(name)!);
    const marker = JSON.parse(readFileSync(join(agentRoot, name, ".crew.json"), "utf8"));
    expect(marker.resolved_sha).toBe(sha);
    expect(marker.ref).toBe(sha);
    expect(marker.content_hash).toBe(hashDirectory(store));
    expect(marker.content_hash).toBe(entry.content_hash);
  }
  // One root acquisition, then one enclosing-tree export shared by all three parents.
  expect(roots).toHaveLength(2);
  for (const root of roots) expect(existsSync(root)).toBe(false);
});
