/**
 * Path-sharing end-to-end tests (§7.2, §7.3, §7.4, C-SHARE-*,
 * C-UNINST-16/17).
 *
 * When two adapters resolve to the same filesystem install path,
 * crew writes bytes once but reports the install to the user under
 * both adapter names. Uninstalling one adapter removes it from the
 * marker's `adapters` list but leaves bytes in place until the last
 * adapter leaves.
 *
 * To exercise the shared-path path deterministically, we point
 * `codex` and `gemini-cli` at the SAME user-scope directory at test
 * time — the same convergence that happens on a real user machine
 * when both tools read `~/.agents/skills/` (codex's documented path
 * and gemini's alias).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

interface Redirect {
  shared: string;
  ccRoot: string;
  restore(): void;
}

function redirectToSharedPath(): Redirect {
  const shared = makeTempDir("crew-shared-");
  const ccRoot = makeTempDir("crew-cc-");
  const originals = {
    cc: {
      userPath: claudeCodeAdapter.userPath,
      projectPath: claudeCodeAdapter.projectPath,
      detect: claudeCodeAdapter.detect,
    },
    co: {
      userPath: codexAdapter.userPath,
      projectPath: codexAdapter.projectPath,
      detect: codexAdapter.detect,
    },
    ge: {
      userPath: geminiCliAdapter.userPath,
      projectPath: geminiCliAdapter.projectPath,
      detect: geminiCliAdapter.detect,
    },
  };
  type Mut = {
    userPath: () => string;
    projectPath: (cwd: string) => string;
    detect: () => boolean;
  };
  // Claude Code stays separate (its real `.claude/skills/`).
  (claudeCodeAdapter as Mut).userPath = () => ccRoot;
  (claudeCodeAdapter as Mut).projectPath = (cwd) => join(cwd, ".claude", "skills");
  (claudeCodeAdapter as Mut).detect = () => true;
  // Codex + Gemini both redirect to the *same* dir — this is the
  // convergence we want to exercise.
  (codexAdapter as Mut).userPath = () => shared;
  (codexAdapter as Mut).projectPath = (cwd) => join(cwd, ".agents", "skills");
  (codexAdapter as Mut).detect = () => true;
  (geminiCliAdapter as Mut).userPath = () => shared;
  (geminiCliAdapter as Mut).projectPath = (cwd) => join(cwd, ".agents", "skills");
  (geminiCliAdapter as Mut).detect = () => true;
  return {
    shared,
    ccRoot,
    restore() {
      (claudeCodeAdapter as Mut).userPath = originals.cc.userPath;
      (claudeCodeAdapter as Mut).projectPath = originals.cc.projectPath;
      (claudeCodeAdapter as Mut).detect = originals.cc.detect;
      (codexAdapter as Mut).userPath = originals.co.userPath;
      (codexAdapter as Mut).projectPath = originals.co.projectPath;
      (codexAdapter as Mut).detect = originals.co.detect;
      (geminiCliAdapter as Mut).userPath = originals.ge.userPath;
      (geminiCliAdapter as Mut).projectPath = originals.ge.projectPath;
      (geminiCliAdapter as Mut).detect = originals.ge.detect;
    },
  };
}

let redirect: Redirect;

beforeEach(() => {
  redirect = redirectToSharedPath();
});

afterEach(() => {
  redirect.restore();
});

describe("path sharing (§7.2)", () => {
  test("C-SHARE-01 one install, multiple adapter names reported", () => {
    const home = makeCrewHome();
    const src = makeTempDir("crew-src-");
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    const capture = captureStreams();
    const code = runCli(["install", skill], { home, streams: capture.streams });
    expect(code).toBe(0);

    // Bytes exist exactly once — at the shared dest.
    const sharedDest = join(redirect.shared, "demo");
    expect(existsSync(join(sharedDest, "SKILL.md"))).toBe(true);
    const ccDest = join(redirect.ccRoot, "demo");
    expect(existsSync(join(ccDest, "SKILL.md"))).toBe(true);

    // State lists every adapter that owns the install.
    const state = readState(home);
    expect(state.installations).toHaveLength(1);
    expect([...state.installations[0]!.agents].sort()).toEqual([
      "claude-code",
      "codex",
      "gemini-cli",
    ]);
  });

  test("C-SHARE-02 marker.agents is non-empty and sorted", () => {
    const home = makeCrewHome();
    const src = makeTempDir("crew-src-");
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", skill], { home, streams: captureStreams().streams });

    const sharedMarker = JSON.parse(
      readFileSync(join(redirect.shared, "demo", ".crew.json"), "utf8"),
    ) as { agents: string[] };
    expect(sharedMarker.agents).toEqual(["codex", "gemini-cli"]);

    const ccMarker = JSON.parse(
      readFileSync(join(redirect.ccRoot, "demo", ".crew.json"), "utf8"),
    ) as { agents: string[] };
    expect(ccMarker.agents).toEqual(["claude-code"]);
  });

  test("C-SHARE-03 re-install with a newly-detected adapter unions the marker", () => {
    const home = makeCrewHome();
    const src = makeTempDir("crew-src-");
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));

    // First install with only codex active.
    type Mut = { detect: () => boolean };
    (geminiCliAdapter as Mut).detect = () => false;
    runCli(["install", skill], { home, streams: captureStreams().streams });

    const marker1 = JSON.parse(
      readFileSync(join(redirect.shared, "demo", ".crew.json"), "utf8"),
    ) as { agents: string[] };
    expect(marker1.agents).toEqual(["codex"]);

    // Now turn gemini on and reinstall. The skill bytes are unchanged
    // so it's an `up_to_date` reinstall from the store's perspective,
    // but the marker should gain gemini-cli.
    (geminiCliAdapter as Mut).detect = () => true;
    runCli(["install", "--force", skill], { home, streams: captureStreams().streams });

    const marker2 = JSON.parse(
      readFileSync(join(redirect.shared, "demo", ".crew.json"), "utf8"),
    ) as { agents: string[] };
    expect(marker2.agents).toEqual(["codex", "gemini-cli"]);

    const state = readState(home);
    const entry = state.installations.find((e) => e.name === "demo");
    expect(entry).toBeDefined();
    expect(entry!.agents).toContain("codex");
    expect(entry!.agents).toContain("gemini-cli");
  });
});
