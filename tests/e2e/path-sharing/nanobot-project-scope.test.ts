/**
 * An adapter with an empty project base path is skipped for project-scope
 * installs while the others still install (§7.2).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
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
  test("nanobot is not applicable for project scope", () => {
    // nanobot is already neutralized by the preload (returns false
    // from detect()), but we force it on here to exercise the
    // "empty base path = skipped" branch for project scope.
    const { nanobotAdapter } =
      require("../../../src/agents/nanobot.ts") as typeof import("../../../src/agents/nanobot.ts");
    type Mut = {
      detect: () => boolean;
      projectPath: (cwd: string) => string;
      userPath: () => string;
    };
    const orig = {
      detect: nanobotAdapter.detect,
      projectPath: nanobotAdapter.projectPath,
      userPath: nanobotAdapter.userPath,
    };
    (nanobotAdapter as Mut).detect = () => true;
    (nanobotAdapter as Mut).projectPath = () => "";
    // User path still non-empty — force it to a tmp dir so we don't
    // pollute the real nanobot install dir.
    const nanoRoot = makeTempDir("crew-nano-");
    (nanobotAdapter as Mut).userPath = () => nanoRoot;
    try {
      const home = makeCrewHome();
      const projCwd = makeTempDir("crew-proj-");
      writeFileSync(join(projCwd, "crew.yaml"), ""); // just a marker
      const src = makeTempDir("crew-src-");
      const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));

      // Project install — nanobot is skipped because its projectPath
      // is empty, but claude-code + codex + gemini still install.
      runCli(["install", "--scope", "project", skill], {
        home,
        cwd: projCwd,
        streams: captureStreams().streams,
      });

      // nanobot user dir should NOT have the skill installed (project scope).
      expect(existsSync(join(nanoRoot, "demo"))).toBe(false);
      // but the other adapters did.
      expect(existsSync(join(projCwd, ".claude", "skills", "demo"))).toBe(true);
      expect(existsSync(join(projCwd, ".agents", "skills", "demo"))).toBe(true);
    } finally {
      (nanobotAdapter as Mut).detect = orig.detect;
      (nanobotAdapter as Mut).projectPath = orig.projectPath;
      (nanobotAdapter as Mut).userPath = orig.userPath;
    }
  });
});
