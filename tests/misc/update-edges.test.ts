/**
 * Update flow edge cases that fill the remaining uncovered branches
 * in `src/install/update-one.ts` and `src/commands/update.ts`.
 *
 * Covers:
 *   - tap-not-in-config: a state entry whose `source.tap` is absent
 *     from `config.yaml` (user manually deleted the tap row). Update
 *     raises `source_unreachable` with a pointer to doctor --repair.
 *   - skill-gone-from-tap: the tap is still present but the specific
 *     skill directory is missing from the tap on disk. Update returns
 *     `source_gone` and preserves the local install.
 *   - FAILED outcome rendering: `updateOneEntry` raises a non-soft,
 *     non-hard-recognized error so update.ts's formatRow falls to the
 *     `FAILED` line.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../src/cli/main.ts";
import { readConfig, writeConfig } from "../../src/config/load.ts";
import { readState } from "../../src/state/load.ts";
import { claudeCodeAdapter } from "../../src/targets/claude-code.ts";
import { codexAdapter } from "../../src/targets/codex.ts";
import { geminiCliAdapter } from "../../src/targets/gemini-cli.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

let restore: (() => void) | null = null;

function setupTargets() {
  const cc = makeTempDir("crew-cc-");
  const co = makeTempDir("crew-co-");
  const ge = makeTempDir("crew-ge-");
  const originals = {
    cc: { u: claudeCodeAdapter.userPath, d: claudeCodeAdapter.detect },
    co: { u: codexAdapter.userPath, d: codexAdapter.detect },
    ge: { u: geminiCliAdapter.userPath, d: geminiCliAdapter.detect },
  };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => cc;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  (codexAdapter as { userPath: () => string }).userPath = () => co;
  (codexAdapter as { detect: () => boolean }).detect = () => true;
  (geminiCliAdapter as { userPath: () => string }).userPath = () => ge;
  (geminiCliAdapter as { detect: () => boolean }).detect = () => true;
  restore = () => {
    (claudeCodeAdapter as { userPath: () => string }).userPath = originals.cc.u;
    (claudeCodeAdapter as { detect: () => boolean }).detect = originals.cc.d;
    (codexAdapter as { userPath: () => string }).userPath = originals.co.u;
    (codexAdapter as { detect: () => boolean }).detect = originals.co.d;
    (geminiCliAdapter as { userPath: () => string }).userPath = originals.ge.u;
    (geminiCliAdapter as { detect: () => boolean }).detect = originals.ge.d;
  };
}

beforeEach(() => setupTargets());
afterEach(() => {
  if (restore) restore();
  restore = null;
});

function singleSkillRepo(prefix: string, name: string): string {
  const repo = makeTempDir(prefix);
  makeGitRepo(repo);
  makeSkill(repo, name, skillFrontmatter({ name }));
  commitAll(repo, "init");
  return repo;
}

describe("update edge cases", () => {
  test("tap removed from config manually → source_unreachable → FAILED row", () => {
    const home = makeCrewHome();
    const repo = singleSkillRepo("crew-upd-edge-", "demo");
    runCli(["install", `file://${repo}//demo`], {
      home,
      streams: captureStreams().streams,
    });
    // Manually strip the tap row from config.yaml. State still
    // references it by name — exactly the "user manually deleted"
    // state that update-one.ts's tap-lookup check catches.
    const cfg = readConfig(home);
    const state = readState(home);
    const orphanedTapName = state.installations[0]!.source.tap;
    writeConfig({ ...cfg, taps: cfg.taps.filter((t) => t.name !== orphanedTapName) }, home);
    // Upstream the repo moves so update would try to refresh.
    commitAll(repo, "noop");
    const c = captureStreams();
    const code = runCli(["update"], { home, streams: c.streams });
    expect(code).toBe(1);
    expect(c.stdout()).toContain("FAILED");
    expect(c.stdout()).toContain("source_unreachable");
  });

  test("skill removed from tap upstream → source_gone", () => {
    const home = makeCrewHome();
    const repo = singleSkillRepo("crew-skill-gone-", "demo");
    // Subpath tap pointing at the skill directly (skill = tap root).
    runCli(["install", `file://${repo}//demo`], {
      home,
      streams: captureStreams().streams,
    });
    // The tap-reexpand path handles additions / whole-tap source_gone.
    // To trigger the update-one.ts `no_skills_found` throw specifically,
    // the tap has to still exist but the subpath SKILL.md disappears.
    // Replace the SKILL.md with a non-skill file and commit.
    rmSync(join(repo, "demo", "SKILL.md"));
    commitAll(repo, "remove SKILL.md inside demo");
    const c = captureStreams();
    const code = runCli(["update"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("source_gone");
  });
});
