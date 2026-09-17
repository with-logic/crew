/**
 * End-to-end install flow from a local path (§7, §9; C-INST-01/04/11/15/16/17).
 *
 * Runs the real install flow against real on-disk fixtures: a fake
 * `~/.crew/` under a tmp dir, and target adapters pointed at tmp
 * directories by monkey-patching their base-dir lookups.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
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

describe("install from local path", () => {
  test("C-INST-01 installs into every target (user scope)", () => {
    const home = makeCrewHome();
    const src = makeTempDir("crew-src-");
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }), "body");
    writeFileSync(join(skill, "RESOURCE.md"), "hello");

    const capture = captureStreams();
    const code = runCli(["install", skill], { home, streams: capture.streams });
    expect(code).toBe(0);

    for (const adapter of ["claude-code", "codex", "gemini-cli"]) {
      const dest = join(redirect.agents[adapter]!, "demo");
      expect(existsSync(join(dest, "SKILL.md"))).toBe(true);
      expect(existsSync(join(dest, "RESOURCE.md"))).toBe(true);
      expect(existsSync(join(dest, ".crew.json"))).toBe(true);
    }

    const state = readState(home);
    expect(state.installations).toHaveLength(1);
    expect([...state.installations[0]!.agents].sort()).toEqual([
      "claude-code",
      "codex",
      "gemini-cli",
    ]);
  });

  test("C-INST-04 marker is written with fields", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    const capture = captureStreams();
    runCli(["install", skill], { home, streams: capture.streams });
    const marker = JSON.parse(
      require("node:fs").readFileSync(
        join(redirect.agents["claude-code"]!, "demo", ".crew.json"),
        "utf8",
      ),
    );
    expect(marker.schema_version).toBe(1);
    expect(marker.name).toBe("demo");
    expect(marker.tap_kind).toBe("path");
    expect(marker.resolved_sha).toBe(null);
    expect(marker.content_hash).toMatch(/^sha256:/);
    expect(marker.installed_by).toMatch(/^crew\//);
  });

  test("C-INST-11 same skill twice -> 'already installed' exit 0", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", skill], { home, streams: captureStreams().streams });
    const capture = captureStreams();
    const code = runCli(["install", skill], { home, streams: capture.streams });
    expect(code).toBe(0);
    const out = capture.stdout();
    expect(out).toContain("already installed");
    // New rendering: a full per-skill block with a per-agent row for
    // each agent the skill is installed into (muted marker, not ✓).
    // Verify at least one per-agent row with the destination path is
    // present — this is the regression guard for the old one-liner.
    expect(out).toContain("(already installed)");
    // Per-agent row carries the muted marker (plain-styler "-"
    // on non-TTY, "·" on TTY) followed by the agent and a "→"
    // separator ahead of the install path. The regex nails down
    // every element so a regression in the muted-marker path
    // surfaces here.
    expect(out).toMatch(/[-·]\s+claude-code\s+→.+demo/);
  });

  test("C-INST-15 --dry-run writes no files", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    const capture = captureStreams();
    const code = runCli(["install", "--dry-run", skill], { home, streams: capture.streams });
    expect(code).toBe(0);
    for (const adapter of ["claude-code", "codex", "gemini-cli"]) {
      expect(existsSync(join(redirect.agents[adapter]!, "demo"))).toBe(false);
    }
  });

  test("C-INST-16 --target restricts", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    const code = runCli(["install", "--agent", "claude-code", skill], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    expect(existsSync(join(redirect.agents["claude-code"]!, "demo", "SKILL.md"))).toBe(true);
    expect(existsSync(join(redirect.agents["codex"]!, "demo"))).toBe(false);
  });

  test("C-INST-17 --scope project installs under cwd", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    const projCwd = makeTempDir("crew-proj-install-");
    const code = runCli(["install", "--scope", "project", skill], {
      home,
      cwd: projCwd,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    expect(existsSync(join(projCwd, ".claude", "skills", "demo", "SKILL.md"))).toBe(true);
  });
});
