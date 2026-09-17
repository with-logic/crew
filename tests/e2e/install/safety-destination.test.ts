/**
 * Install safety at the destination: untracked directories and
 * inconsistent markers (§7.3 step 5; C-SAFE-01/04/06).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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

describe("install safety", () => {
  test("C-SAFE-01 untracked destination -> untracked_directory exit 6", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    const destParent = redirect.agents["claude-code"]!;
    mkdirSync(join(destParent, "demo"), { recursive: true });
    writeFileSync(join(destParent, "demo", "user-file.txt"), "don't touch me");

    const capture = captureStreams();
    const code = runCli(["install", "--agent", "claude-code", join(src, "demo")], {
      home,
      streams: capture.streams,
    });
    // claude-code failed but codex/gemini weren't targeted → anySuccess false → exit 1.
    // Per §18.6 clarification, a root skill with zero successes exits 1.
    expect(code).toBe(1);
    // File untouched.
    expect(existsSync(join(destParent, "demo", "user-file.txt"))).toBe(true);
  });

  test("C-SAFE-06 --force overrides untracked_directory", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    const destParent = redirect.agents["claude-code"]!;
    mkdirSync(join(destParent, "demo"), { recursive: true });
    writeFileSync(join(destParent, "demo", "user-file.txt"), "don't touch me");

    const code = runCli(["install", "--force", "--agent", "claude-code", join(src, "demo")], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    // Destination now reflects the staged skill; user-file is gone.
    expect(existsSync(join(destParent, "demo", "user-file.txt"))).toBe(false);
    expect(existsSync(join(destParent, "demo", "SKILL.md"))).toBe(true);
  });

  test("C-SAFE-04 inconsistent marker", () => {
    const home = makeCrewHome();
    const destParent = redirect.agents["claude-code"]!;
    mkdirSync(join(destParent, "demo"), { recursive: true });
    writeFileSync(
      join(destParent, "demo", ".crew.json"),
      JSON.stringify({
        schema_version: 1,
        name: "something-else",
        source: { type: "path", path: "/x" },
        ref: null,
        resolved_sha: null,
        content_hash: "sha256:0",
        scope: "user",
        installed_at: "2026-04-18T00:00:00Z",
        installed_by: "crew/test",
      }),
    );
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    const code = runCli(["install", "--agent", "claude-code", skill], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(1);
  });
});
