/**
 * Uninstalling one adapter at a shared install path detaches it from the
 * marker; bytes leave only with the last adapter (§7.4; C-UNINST-16/17).
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
  test("C-UNINST-16/17 uninstall --target detaches one adapter; bytes stay", () => {
    const home = makeCrewHome();
    const src = makeTempDir("crew-src-");
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", skill], { home, streams: captureStreams().streams });

    // Uninstall only codex. Gemini-cli and claude-code still own
    // their markers, so NO bytes go away.
    const code = runCli(["uninstall", "--agent", "codex", "demo"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);

    // Bytes still present at the shared path.
    const sharedDest = join(redirect.shared, "demo");
    expect(existsSync(join(sharedDest, "SKILL.md"))).toBe(true);
    // Marker at shared path lists only gemini-cli now.
    const marker = JSON.parse(readFileSync(join(sharedDest, ".crew.json"), "utf8")) as {
      agents: string[];
    };
    expect(marker.agents).toEqual(["gemini-cli"]);

    // Claude Code still untouched.
    expect(existsSync(join(redirect.ccRoot, "demo", "SKILL.md"))).toBe(true);

    // State entry survives with reduced targets.
    const state = readState(home);
    const entry = state.installations.find((e) => e.name === "demo");
    expect(entry).toBeDefined();
    expect([...entry!.agents].sort()).toEqual(["claude-code", "gemini-cli"]);
  });

  test("uninstall --target for the LAST adapter at a shared path removes bytes", () => {
    const home = makeCrewHome();
    const src = makeTempDir("crew-src-");
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", skill], { home, streams: captureStreams().streams });

    // Remove both codex and gemini-cli in one command — shared path
    // empties out.
    runCli(["uninstall", "--agent", "codex", "--agent", "gemini-cli", "demo"], {
      home,
      streams: captureStreams().streams,
    });

    expect(existsSync(join(redirect.shared, "demo"))).toBe(false);
    expect(existsSync(join(redirect.ccRoot, "demo", "SKILL.md"))).toBe(true);

    const state = readState(home);
    const entry = state.installations.find((e) => e.name === "demo");
    expect(entry).toBeDefined();
    expect(entry!.agents).toEqual(["claude-code"]);
  });
});
