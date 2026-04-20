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
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../src/cli/main.ts";
import { readState } from "../../src/state/load.ts";
import { claudeCodeAdapter } from "../../src/targets/claude-code.ts";
import { codexAdapter } from "../../src/targets/codex.ts";
import { geminiCliAdapter } from "../../src/targets/gemini-cli.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

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
    expect([...state.installations[0]!.targets].sort()).toEqual([
      "claude-code",
      "codex",
      "gemini-cli",
    ]);
  });

  test("C-SHARE-02 marker.adapters is non-empty and sorted", () => {
    const home = makeCrewHome();
    const src = makeTempDir("crew-src-");
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", skill], { home, streams: captureStreams().streams });

    const sharedMarker = JSON.parse(
      readFileSync(join(redirect.shared, "demo", ".crew.json"), "utf8"),
    ) as { adapters: string[] };
    expect(sharedMarker.adapters).toEqual(["codex", "gemini-cli"]);

    const ccMarker = JSON.parse(
      readFileSync(join(redirect.ccRoot, "demo", ".crew.json"), "utf8"),
    ) as { adapters: string[] };
    expect(ccMarker.adapters).toEqual(["claude-code"]);
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
    ) as { adapters: string[] };
    expect(marker1.adapters).toEqual(["codex"]);

    // Now turn gemini on and reinstall. The skill bytes are unchanged
    // so it's an `up_to_date` reinstall from the store's perspective,
    // but the marker should gain gemini-cli.
    (geminiCliAdapter as Mut).detect = () => true;
    runCli(["install", "--force", skill], { home, streams: captureStreams().streams });

    const marker2 = JSON.parse(
      readFileSync(join(redirect.shared, "demo", ".crew.json"), "utf8"),
    ) as { adapters: string[] };
    expect(marker2.adapters).toEqual(["codex", "gemini-cli"]);

    const state = readState(home);
    const entry = state.installations.find((e) => e.name === "demo");
    expect(entry).toBeDefined();
    expect(entry!.targets).toContain("codex");
    expect(entry!.targets).toContain("gemini-cli");
  });

  test("C-UNINST-16/17 uninstall --target detaches one adapter; bytes stay", () => {
    const home = makeCrewHome();
    const src = makeTempDir("crew-src-");
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", skill], { home, streams: captureStreams().streams });

    // Uninstall only codex. Gemini-cli and claude-code still own
    // their markers, so NO bytes go away.
    const code = runCli(["uninstall", "--target", "codex", "demo"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);

    // Bytes still present at the shared path.
    const sharedDest = join(redirect.shared, "demo");
    expect(existsSync(join(sharedDest, "SKILL.md"))).toBe(true);
    // Marker at shared path lists only gemini-cli now.
    const marker = JSON.parse(readFileSync(join(sharedDest, ".crew.json"), "utf8")) as {
      adapters: string[];
    };
    expect(marker.adapters).toEqual(["gemini-cli"]);

    // Claude Code still untouched.
    expect(existsSync(join(redirect.ccRoot, "demo", "SKILL.md"))).toBe(true);

    // State entry survives with reduced targets.
    const state = readState(home);
    const entry = state.installations.find((e) => e.name === "demo");
    expect(entry).toBeDefined();
    expect([...entry!.targets].sort()).toEqual(["claude-code", "gemini-cli"]);
  });

  test("uninstall --target for the LAST adapter at a shared path removes bytes", () => {
    const home = makeCrewHome();
    const src = makeTempDir("crew-src-");
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", skill], { home, streams: captureStreams().streams });

    // Remove both codex and gemini-cli in one command — shared path
    // empties out.
    runCli(["uninstall", "--target", "codex", "--target", "gemini-cli", "demo"], {
      home,
      streams: captureStreams().streams,
    });

    expect(existsSync(join(redirect.shared, "demo"))).toBe(false);
    expect(existsSync(join(redirect.ccRoot, "demo", "SKILL.md"))).toBe(true);

    const state = readState(home);
    const entry = state.installations.find((e) => e.name === "demo");
    expect(entry).toBeDefined();
    expect(entry!.targets).toEqual(["claude-code"]);
  });

  test("nanobot is not applicable for project scope", () => {
    // nanobot is already neutralized by the preload (returns false
    // from detect()), but we force it on here to exercise the
    // "empty base path = skipped" branch for project scope.
    const { nanobotAdapter } =
      require("../../src/targets/nanobot.ts") as typeof import("../../src/targets/nanobot.ts");
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
