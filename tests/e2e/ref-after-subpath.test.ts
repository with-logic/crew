/**
 * Ref-last git reference through the real CLI (§8.2, C-REF-31):
 * `file://<repo>//<sub>@<sha>` is recorded exactly like `@<sha>//<sub>`.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { runCli } from "../../src/cli/main.ts";
import { readState } from "../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

let ccRoot = "";
let restore: (() => void) | null = null;

beforeEach(() => {
  ccRoot = makeTempDir("crew-cc-");
  const originals = { u: claudeCodeAdapter.userPath, d: claudeCodeAdapter.detect };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  restore = () => {
    (claudeCodeAdapter as { userPath: () => string }).userPath = originals.u;
    (claudeCodeAdapter as { detect: () => boolean }).detect = originals.d;
  };
});
afterEach(() => {
  restore?.();
  restore = null;
});

test("C-REF-31 install file://<repo>//<sub>@<sha> records the ref and pins", () => {
  const home = makeCrewHome();
  const repo = makeTempDir("crew-reflast-");
  makeGitRepo(repo);
  makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }));
  const sha = commitAll(repo, "add demo");

  // Both installs name their agent: only Claude Code is redirected here, so
  // an unrestricted install would make the recorded agent list depend on
  // which adapters the host happens to have.
  const refFirst = makeCrewHome();
  expect(
    runCli(["install", `file://${repo}@${sha}//demo`, "--agent", "claude-code"], {
      home: refFirst,
      streams: captureStreams().streams,
    }),
  ).toBe(0);
  const expected = readState(refFirst).installations[0]!;

  const out = captureStreams();
  const code = runCli(["install", `file://${repo}//demo@${sha}`, "--agent", "claude-code"], {
    home,
    streams: out.streams,
  });
  expect(code).toBe(0);
  expect(existsSync(join(ccRoot, "demo", "SKILL.md"))).toBe(true);

  const entry = readState(home).installations[0]!;
  expect(entry.ref).toBe(sha);
  expect(entry.pinned).toBe(true);
  expect(entry.resolved_sha).toBe(sha);
  // Same recorded shape as the ref-first form, bar the two fields that vary
  // per run: the derived auto-tap name in `source` and the `installed_at`
  // timestamp.
  expect({ ...entry, source: null, installed_at: null }).toEqual({
    ...expected,
    source: null,
    installed_at: null,
  });
});
