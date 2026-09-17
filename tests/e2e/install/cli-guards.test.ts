/**
 * Refusals and global flags through the install fixtures: no targets, an
 * invalid skill, unknown commands and flags, `--json`, `--quiet` (§5, §13;
 * C-TARGET-05, C-SPEC-13).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

type Redirectable = {
  userPath: () => string;
  projectPath: (cwd: string) => string;
  detect: () => boolean;
};
/** Every target adapter with the `<cwd>/<dir>/skills` project layout it uses. */
const ADAPTERS: ReadonlyArray<readonly [name: string, adapter: Redirectable, dir: string]> = [
  ["claude-code", claudeCodeAdapter, ".claude"],
  ["codex", codexAdapter, ".codex"],
  ["gemini-cli", geminiCliAdapter, ".gemini"],
];

/**
 * Redirect every target adapter to a tmp directory so tests never touch
 * `~/.claude/skills` etc. Returns the tmp roots keyed by adapter name and
 * a restore function.
 */
function redirectAdapters(): { agents: Record<string, string>; restore: () => void } {
  const agents: Record<string, string> = {};
  const saved = ADAPTERS.map(
    ([, adapter]) =>
      [
        adapter,
        { userPath: adapter.userPath, projectPath: adapter.projectPath, detect: adapter.detect },
      ] as const,
  );
  for (const [name, adapter, dir] of ADAPTERS) {
    const root = makeTempDir(`crew-${name}-`);
    agents[name] = root;
    adapter.userPath = () => root;
    adapter.projectPath = (cwd) => join(cwd, dir, "skills");
    adapter.detect = () => true;
  }
  return {
    agents,
    restore() {
      for (const [adapter, original] of saved) Object.assign(adapter, original);
    },
  };
}

let redirect: ReturnType<typeof redirectAdapters>;

beforeEach(() => {
  redirect = redirectAdapters();
});
afterEach(() => {
  redirect.restore();
});

describe("install target detection failure", () => {
  test("C-TARGET-05 no targets -> no_agents exit 4", () => {
    const home = makeCrewHome();
    // Disable every target.
    runCli(["agents", "disable", "claude-code"], { home, streams: captureStreams().streams });
    runCli(["agents", "disable", "codex"], { home, streams: captureStreams().streams });
    runCli(["agents", "disable", "gemini-cli"], { home, streams: captureStreams().streams });
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    const code = runCli(["install", skill], { home, streams: captureStreams().streams });
    expect(code).toBe(4);
  });
});

describe("install invalid skill", () => {
  test("C-SPEC-13 validation failure writes no files", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    const bad = makeSkill(src, "demo", "not yaml :: at all");
    const code = runCli(["install", bad], { home, streams: captureStreams().streams });
    expect(code).toBe(4);
    for (const adapter of ["claude-code", "codex", "gemini-cli"]) {
      expect(existsSync(join(redirect.agents[adapter]!, "demo"))).toBe(false);
    }
  });
});

describe("unknown commands and flags", () => {
  test("unknown command -> exit 4", () => {
    const home = makeCrewHome();
    const code = runCli(["frobnicate"], { home, streams: captureStreams().streams });
    expect(code).toBe(4);
  });

  test("unknown flag -> exit 4", () => {
    const home = makeCrewHome();
    const code = runCli(["install", "--bogus", "demo"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(4);
  });

  test("version returns 0 and prints", () => {
    const home = makeCrewHome();
    const capture = captureStreams();
    const code = runCli(["version"], { home, streams: capture.streams });
    expect(code).toBe(0);
    expect(capture.stdout()).toMatch(/crew \d+\.\d+\.\d+/);
  });

  test("bare `crew` shows the help overview and exits 0", () => {
    const home = makeCrewHome();
    const capture = captureStreams();
    const code = runCli([], { home, streams: capture.streams });
    expect(code).toBe(0);
    const stdout = capture.stdout();
    expect(stdout).toContain("GETTING STARTED");
    expect(stdout).toContain("COMMANDS");
  });

  test("--json outputs valid JSON", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", join(src, "demo")], { home, streams: captureStreams().streams });
    const capture = captureStreams();
    runCli(["list", "--json"], { home, streams: capture.streams });
    const parsed = JSON.parse(capture.stdout());
    expect(parsed.installations[0].name).toBe("demo");
  });

  test("--json on error returns structured payload", () => {
    const home = makeCrewHome();
    const capture = captureStreams();
    runCli(["uninstall", "--json", "ghost"], { home, streams: capture.streams });
    const parsed = JSON.parse(capture.stdout());
    expect(parsed.error.name).toBe("not_installed_here");
  });

  test("--quiet suppresses stdout", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    const capture = captureStreams();
    runCli(["install", "--quiet", join(src, "demo")], { home, streams: capture.streams });
    expect(capture.stdout()).toBe("");
  });
});
